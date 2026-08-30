// ============================================================
// 情报富化引擎 — 免费 API + 本地实现
// 原则：
//   1. 无 Key 数据源（abuse.ch 三件套 / CISA KEV / NVD / Cloudflare DoH）
//      与本地 ip2region 默认启用
//   2. Key 型数据源（VirusTotal / AbuseIPDB / urlscan）未配置 Key 时
//      静默跳过该源，不影响其他富化与 AI 研判主流程
//   3. 单源失败/超时不阻断；同 IOC 结果缓存 24h（DoH 1h / NVD 7d）
// ============================================================

import type { EnrichmentConfig } from '../types';
import { DEFAULT_ENRICHMENT_CONFIG } from '../types';
import { log } from '../utils/logger';
import { detectIocs } from '../utils/ioc-detector';

// ================================================================
// 类型与常量
// ================================================================

export interface EnrichHit {
  source: string;
  indicator: string;
  verdict: string;
}

export interface EnrichSummaryItem {
  source: string;
  queried: number;
  hits: number;
  skipped?: string;
}

export interface EnrichOutcome {
  context: string;
  summary: EnrichSummaryItem[];
}

const FETCH_TIMEOUT_MS = 8_000;
const CACHE_KEY = 'enrichCache';
const CACHE_TTL_IOC = 24 * 3600_000;   // IOC 查询 24h
const CACHE_TTL_DOH = 3600_000;        // DNS 解析 1h
const CACHE_TTL_NVD = 7 * 24 * 3600_000; // CVE 详情 7d
const CACHE_MAX = 200;
const KEV_FEED_KEY = 'enrichKevFeed';
const KEV_TTL = 24 * 3600_000;
const MAX_PER_TYPE = 3; // 每类 IOC 最多查 3 个，控制总时长

interface CacheEntry {
  ts: number;
  text: string | null; // 格式化结果行；null = 已查无结果
}

// ================================================================
// 缓存（chrome.storage.local）
// ================================================================

async function cacheGet(key: string, ttl: number): Promise<string | null | undefined> {
  try {
    const raw = await chrome.storage.local.get(CACHE_KEY);
    const map = (raw?.[CACHE_KEY] ?? {}) as Record<string, CacheEntry>;
    const e = map[key];
    if (!e) return undefined;
    if (Date.now() - e.ts > ttl) return undefined; // 过期视同未缓存
    return e.text;
  } catch {
    return undefined;
  }
}

async function cacheSet(key: string, text: string | null): Promise<void> {
  try {
    const raw = await chrome.storage.local.get(CACHE_KEY);
    const map = (raw?.[CACHE_KEY] ?? {}) as Record<string, CacheEntry>;
    map[key] = { ts: Date.now(), text };
    const keys = Object.keys(map);
    if (keys.length > CACHE_MAX) {
      // 超限：按时间淘汰最旧的一半
      keys.sort((a, b) => map[a].ts - map[b].ts);
      for (const k of keys.slice(0, keys.length - CACHE_MAX)) delete map[k];
    }
    await chrome.storage.local.set({ [CACHE_KEY]: map });
  } catch {
    // 缓存失败不影响主流程
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const resp = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!resp.ok) return null;
    return (await resp.json()) as T;
  } catch {
    return null;
  }
}

// ================================================================
// 源解析：根据配置 + Key 决定哪些源生效（纯函数，可单测）
// ================================================================

export interface ResolvedSources {
  urlhaus: boolean;
  threatfox: boolean;
  malwareBazaar: boolean;
  kev: boolean;
  nvd: boolean;
  doh: boolean;
  ipLocale: boolean;
  vt: boolean;
  abuseipdb: boolean;
  urlscan: boolean;
}

/** Key 型源无 Key 自动裁切；总开关关闭时全部为 false */
export function resolveActiveSources(cfg: EnrichmentConfig | undefined): ResolvedSources {
  const c = cfg ?? DEFAULT_ENRICHMENT_CONFIG;
  if (!c.enabled) {
    return { urlhaus: false, threatfox: false, malwareBazaar: false, kev: false, nvd: false, doh: false, ipLocale: false, vt: false, abuseipdb: false, urlscan: false };
  }
  return {
    urlhaus: !!c.urlhaus,
    threatfox: !!c.threatfox,
    malwareBazaar: !!c.malwareBazaar,
    kev: !!c.kev,
    nvd: !!c.nvd,
    doh: !!c.doh,
    ipLocale: !!c.ipLocale,
    // Key 裁切：未配置 Key 的源返回 false（调用方据此跳过）
    vt: !!c.vtApiKey,
    abuseipdb: !!c.abuseIpdbKey,
    urlscan: !!c.urlscanKey,
  };
}

/** 提取待富化 IOC（每类限量，纯函数，可单测） */
export function pickIocsForEnrich(text: string): {
  ips: string[]; domains: string[]; hashes: string[]; urls: string[]; cves: string[];
} {
  const r = detectIocs(text, { dedup: true, resolveOverlap: true });
  if (!r.success) return { ips: [], domains: [], hashes: [], urls: [], cves: [] };
  const take = (t: string): string[] =>
    r.data.matches.filter((m) => m.type === t).map((m) => m.value).slice(0, MAX_PER_TYPE);
  // 排除内网/本地地址，避免无意义外查
  const ips = take('ipv4').filter((ip) => !/^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.)/.test(ip));
  const domains = take('domain').filter((d) => !/^(localhost|example\.(com|net|org)|test|invalid)$/i.test(d));
  const hashes = [...take('md5'), ...take('sha1'), ...take('sha256')].slice(0, MAX_PER_TYPE);
  return { ips, domains, hashes, urls: take('url'), cves: take('cve') };
}

// ================================================================
// 各源查询（返回格式化行；无命中返回 null）
// ================================================================

type QueryFn = (indicator: string, keys: ResolvedSources, cfg: EnrichmentConfig, allIps?: string[]) => Promise<string | null>;

// --- abuse.ch URLhaus：恶意 URL 分发域 ---
const queryUrlhaus: QueryFn = async (indicator) => {
  const data = await fetchJson<{ query_status: string; threat?: string; urlhaus_reference?: string }>(
    'https://urlhaus-api.abuse.ch/v1/host/',
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `host=${encodeURIComponent(indicator)}` },
  );
  if (!data) return null;
  if (data.query_status === 'ok' && data.threat) {
    return `\`${indicator}\`：URLhaus 已知恶意（${data.threat}）`;
  }
  return null;
};

// --- abuse.ch ThreatFox：IOC 关联（APT/家族） ---
const queryThreatFox: QueryFn = async (indicator) => {
  const data = await fetchJson<{ query_status: string; data?: Array<{ malware: string; threat_type: string; confidence_level: string }> }>(
    'https://threatfox-api.abuse.ch/api/v1/',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'search_ioc', search_term: indicator }),
    },
  );
  if (!data || data.query_status !== 'ok' || !data.data?.length) return null;
  const top = data.data.slice(0, 2).map((d) => `${d.malware}(${d.threat_type}, 置信度${d.confidence_level})`).join('; ');
  return `\`${indicator}\`：ThreatFox 已知恶意 — ${top}`;
};

// --- abuse.ch MalwareBazaar：样本哈希 ---
const queryMalwareBazaar: QueryFn = async (indicator) => {
  const data = await fetchJson<{ query_status: string; data?: Array<{ signature: string; file_type_mimetype: string }> }>(
    'https://mb-api.abuse.ch/v1/',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `query=get_info&hash=${encodeURIComponent(indicator)}`,
    },
  );
  if (!data || data.query_status !== 'ok' || !Array.isArray(data.data) || data.data.length === 0) return null;
  const sig = data.data[0]?.signature ?? '未知家族';
  return `\`${indicator}\`：MalwareBazaar 已知样本 — 家族 \`${sig}\`（${data.data[0]?.file_type_mimetype ?? ''}）`;
};

// --- CISA KEV：已知被利用漏洞 ---
async function loadKevSet(): Promise<Set<string> | null> {
  try {
    const raw = await chrome.storage.local.get(KEV_FEED_KEY);
    const cached = raw?.[KEV_FEED_KEY] as { ts: number; ids: string[] } | undefined;
    if (cached && Date.now() - cached.ts < KEV_TTL) return new Set(cached.ids.map((s) => s.toUpperCase()));
    const feed = await fetchJson<{ vulnerabilities?: Array<{ cveID: string }> }>(
      'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
    );
    if (!feed?.vulnerabilities) return cached ? new Set(cached.ids) : null;
    const ids = feed.vulnerabilities.map((v) => v.cveID);
    chrome.storage.local.set({ [KEV_FEED_KEY]: { ts: Date.now(), ids } }).catch(() => undefined);
    return new Set(ids.map((s) => s.toUpperCase()));
  } catch {
    return null;
  }
}

const queryKev: QueryFn = async (indicator) => {
  const kev = await loadKevSet();
  if (!kev) return null;
  return kev.has(indicator.toUpperCase())
    ? `\`${indicator}\`：**CISA KEV 已知被利用漏洞**（修复优先级最高）`
    : null;
};

// --- NVD：CVE 详情（无 Key 限速 5/30s，缓存 7 天兜底） ---
interface NvdCvssData { baseScore: number; baseSeverity: string }
interface NvdCve {
  metrics?: Record<string, Array<{ cvssData: NvdCvssData }>>;
  descriptions?: Array<{ lang: string; value: string }>;
}
interface NvdResponse { vulnerabilities?: Array<{ cve: NvdCve }> }

const queryNvd: QueryFn = async (indicator) => {
  const data = await fetchJson<NvdResponse>(
    `https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${encodeURIComponent(indicator)}`,
  );
  const v = data?.vulnerabilities?.[0]?.cve;
  if (!v) return null;
  const cvss31 = v.metrics?.cvssMetricV31?.[0]?.cvssData ?? v.metrics?.cvssMetricV30?.[0]?.cvssData ?? v.metrics?.cvssMetricV2?.[0]?.cvssData;
  const desc = v.descriptions?.find((d) => d.lang === 'en')?.value?.slice(0, 160) ?? '';
  const score = cvss31 ? `CVSS ${cvss31.baseScore}(${cvss31.baseSeverity})` : '无评分';
  return `\`${indicator}\`：${score} — ${desc}`;
};

// --- Cloudflare DoH：域名解析（交叉验证 C2） ---
const queryDoh: QueryFn = async (indicator, _keys, _cfg, allIps) => {
  const data = await fetchJson<{ Answer?: Array<{ type: number; data: string }> }>(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(indicator)}&type=A`,
    { headers: { accept: 'application/dns-json' } },
  );
  const aRecords = (data?.Answer ?? []).filter((a) => a.type === 1).map((a) => a.data);
  if (aRecords.length === 0) return null;
  const cross = (allIps ?? []).filter((ip) => aRecords.includes(ip));
  const crossNote = cross.length > 0
    ? `，其中 ${cross.map((c) => `\`${c}\``).join('、')} 与工单内 IP 一致（域名与 IP 关联确认）`
    : '';
  return `\`${indicator}\` 当前解析 → ${aRecords.map((r) => `\`${r}\``).join('、')}${crossNote}`;
};

// --- VirusTotal（需 Key） ---
const queryVt: QueryFn = async (indicator, keys, cfg) => {
  if (!keys.vt || !cfg.vtApiKey) return null;
  const kind = /^\d+\.\d+\.\d+\.\d+$/.test(indicator)
    ? 'ip_addresses'
    : /^[a-f0-9]{32,64}$/i.test(indicator)
      ? 'files'
      : 'domains';
  const data = await fetchJson<{ data?: { attributes?: { last_analysis_stats?: { malicious: number; suspicious: number; total: number }; reputation?: number } } }>(
    `https://www.virustotal.com/api/v3/${kind}/${encodeURIComponent(indicator)}`,
    { headers: { 'x-apikey': cfg.vtApiKey } },
  );
  const s = data?.data?.attributes?.last_analysis_stats;
  if (!s || (s.malicious + s.suspicious) === 0) return null;
  return `\`${indicator}\`：VirusTotal ${s.malicious}/${s.total} 报毒（可疑 ${s.suspicious}）`;
};

// --- AbuseIPDB（需 Key） ---
const queryAbuseIpdb: QueryFn = async (indicator, keys, cfg) => {
  if (!keys.abuseipdb || !cfg.abuseIpdbKey) return null;
  const data = await fetchJson<{ data?: { abuseConfidenceScore: number; totalReports: number; usageType?: string } }>(
    `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(indicator)}&maxAgeInDays=90`,
    { headers: { Key: cfg.abuseIpdbKey, Accept: 'application/json' } },
  );
  const d = data?.data;
  if (!d || d.abuseConfidenceScore < 20) return null;
  return `\`${indicator}\`：AbuseIPDB 信心分 ${d.abuseConfidenceScore}%（${d.totalReports} 次举报${d.usageType ? `，用途 ${d.usageType}` : ''}）`;
};

// --- urlscan.io（需 Key） ---
const queryUrlscan: QueryFn = async (indicator, keys, cfg) => {
  if (!keys.urlscan || !cfg.urlscanKey) return null;
  const q = /^\d+\.\d+\.\d+\.\d+$/.test(indicator) ? `ip:${indicator}` : `domain:${indicator}`;
  const data = await fetchJson<{ total?: number; results?: Array<{ page?: { url?: string } }> }>(
    `https://urlscan.io/api/v1/search/?q=${encodeURIComponent(q)}&size=1`,
    { headers: { 'API-Key': cfg.urlscanKey } },
  );
  if (!data || !data.total) return null;
  return `\`${indicator}\`：urlscan.io 有 ${data.total} 条扫描记录（示例：${data.results?.[0]?.page?.url ?? '—'}）`;
};

// ================================================================
// 主入口
// ================================================================

export async function enrichContext(
  text: string,
  cfg: EnrichmentConfig | undefined,
): Promise<EnrichOutcome> {
  const keys = resolveActiveSources(cfg);
  const allOff = Object.values(keys).every((v) => !v);
  if (allOff) return { context: '', summary: [] };

  const { ips, domains, hashes, cves } = pickIocsForEnrich(text);
  const summary: EnrichSummaryItem[] = [];
  const sections: string[] = [];

  // 源 → (指标列表, 查询函数, 缓存 TTL)
  const jobs: Array<{ source: string; indicators: string[]; ttl: number; query: QueryFn; skipReason?: string }> = [];

  const pushJob = (source: string, on: boolean, indicators: string[], query: QueryFn, ttl = CACHE_TTL_IOC) => {
    if (!on) {
      const isKeyType = source === 'VirusTotal' || source === 'AbuseIPDB' || source === 'urlscan.io';
      if (indicators.length > 0) {
        summary.push({
          source,
          queried: 0,
          hits: 0,
          skipped: isKeyType ? '未配置 API Key，已跳过' : '源已关闭',
        });
      }
      return;
    }
    if (indicators.length === 0) return;
    jobs.push({ source, indicators, ttl, query });
  };

  const iocIndicators = [...ips, ...domains];
  pushJob('URLhaus', keys.urlhaus, domains, queryUrlhaus);
  pushJob('ThreatFox', keys.threatfox, iocIndicators, queryThreatFox);
  pushJob('MalwareBazaar', keys.malwareBazaar, hashes, queryMalwareBazaar);
  pushJob('CISA KEV', keys.kev, cves, queryKev);
  pushJob('NVD', keys.nvd, cves, queryNvd, CACHE_TTL_NVD);
  pushJob('DoH 解析', keys.doh, domains, queryDoh, CACHE_TTL_DOH);
  pushJob('VirusTotal', keys.vt, [...ips, ...domains, ...hashes], queryVt);
  pushJob('AbuseIPDB', keys.abuseipdb, ips, queryAbuseIpdb);
  pushJob('urlscan.io', keys.urlscan, [...ips, ...domains], queryUrlscan);

  // 逐源串行（尊重免费档限速），单源整体 12s 预算
  for (const job of jobs) {
    const lines: string[] = [];
    let hits = 0;
    for (const ind of job.indicators) {
      const cacheKey = `${job.source}|${ind}`;
      const cached = await cacheGet(cacheKey, job.ttl);
      let line: string | null;
      if (cached !== undefined) {
        line = cached;
      } else {
        line = await job.query(ind, keys, cfg ?? DEFAULT_ENRICHMENT_CONFIG, [...ips, ...domains]).catch(() => null);
        await cacheSet(cacheKey, line);
      }
      if (line) {
        lines.push(`- ${line}`);
        hits++;
      }
    }
    summary.push({ source: job.source, queried: job.indicators.length, hits });
    if (lines.length > 0) {
      sections.push(`#### ${job.source}\n${lines.join('\n')}`);
    }
  }

  // 本地 IP 归属（ip2region，无网络，无 Key）
  if (keys.ipLocale && ips.length > 0) {
    const lines = await localIpLocale(ips);
    if (lines.length > 0) {
      summary.push({ source: 'IP 归属(本地)', queried: ips.length, hits: lines.length });
      sections.push(`#### IP 归属（本地 ip2region）\n${lines.map((l) => `- ${l}`).join('\n')}`);
    }
  }

  const context = sections.length > 0
    ? `\n\n以下是自动查询的公开情报富化结果，请结合研判（"已知恶意/被利用"条目应显著提升风险定级；未命中不代表安全）：\n\n${sections.join('\n\n')}`
    : '';

  const hitSources = summary.filter((s) => s.hits > 0).length;
  const skippedSources = summary.filter((s) => s.skipped).map((s) => `${s.source}(${s.skipped})`);
  log.info('enrich', '情报富化完成', { hitSources, sections: sections.length, skipped: skippedSources.join(',') || '无' });

  return { context, summary };
}

// ================================================================
// 本地 ip2region（懒加载 searcher）
// ================================================================

let ipSearcher: import('../utils/ip2region').XdbSearcher | null = null;

async function localIpLocale(ips: string[]): Promise<string[]> {
  try {
    if (!ipSearcher) {
      const { loadXdbFromUrl } = await import('../utils/ip2region');
      ipSearcher = await loadXdbFromUrl(chrome.runtime.getURL('/data/ip2region.db'));
    }
    const out: string[] = [];
    for (const ip of ips) {
      try {
        const r = ipSearcher.search(ip);
        if (r?.region) out.push(`\`${ip}\` 归属：${r.region.replace(/\|+/g, ' · ')}`);
      } catch {
        // 单 IP 失败跳过
      }
    }
    return out;
  } catch {
    return [];
  }
}
