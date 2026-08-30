// ============================================================
// 威胁情报源 — 配置与 URL 构建
// 支持国内外主流威胁情报平台的一键跳转查询
// ============================================================
import type { IntelSource, IntelQueryParams, IocType, IntelSourceType } from '../types';

// ================================================================
// 各情报源 URL 构建器
// ================================================================

function buildVirusTotalUrl({ type, value }: IntelQueryParams): string | null {
  const q = encodeURIComponent(value);
  switch (type) {
    case 'ipv4':
    case 'ipv6':
      return `https://www.virustotal.com/gui/ip-address/${q}`;
    case 'domain':
      return `https://www.virustotal.com/gui/domain/${q}`;
    case 'url':
      return `https://www.virustotal.com/gui/search/${q}`;
    case 'md5':
    case 'sha1':
    case 'sha256':
    case 'sha512':
      return `https://www.virustotal.com/gui/file/${q}`;
    default:
      return `https://www.virustotal.com/gui/search/${q}`;
  }
}

function buildThreatBookUrl({ value }: IntelQueryParams): string | null {
  // 与选中文本浮动工具栏的微步按钮行为保持一致：全部走通用搜索
  const q = encodeURIComponent(value);
  return `https://x.threatbook.com/v5/generalSearch?q=${q}`;
}

function buildAlienVaultUrl({ type, value }: IntelQueryParams): string | null {
  const q = encodeURIComponent(value);
  switch (type) {
    case 'ipv4':
    case 'ipv6':
      return `https://otx.alienvault.com/indicator/ip/${q}`;
    case 'domain':
      return `https://otx.alienvault.com/indicator/domain/${q}`;
    case 'url':
      return `https://otx.alienvault.com/indicator/url/${q}`;
    case 'md5':
    case 'sha1':
    case 'sha256':
    case 'sha512':
      return `https://otx.alienvault.com/indicator/file/${q}`;
    case 'cve':
      return `https://otx.alienvault.com/indicator/cve/${q}`;
    default:
      return `https://otx.alienvault.com/browse/global?q=${q}`;
  }
}

function buildHybridAnalysisUrl({ type, value }: IntelQueryParams): string | null {
  const q = encodeURIComponent(value);
  switch (type) {
    case 'md5':
    case 'sha1':
    case 'sha256':
    case 'sha512':
      return `https://www.hybrid-analysis.com/search?query=${q}`;
    case 'ipv4':
    case 'ipv6':
      return `https://www.hybrid-analysis.com/network/${q}`;
    case 'domain':
      return `https://www.hybrid-analysis.com/network/${q}`;
    case 'url':
      return `https://www.hybrid-analysis.com/search?query=${q}`;
    default:
      return null;
  }
}

function buildUrlscanUrl({ type, value }: IntelQueryParams): string | null {
  const q = encodeURIComponent(value);
  switch (type) {
    case 'ipv4':
    case 'ipv6':
    case 'domain':
    case 'url':
    case 'as':
      return `https://urlscan.io/search/#${q}`;
    case 'sha256':
      return `https://urlscan.io/search/#hash:${q}`;
    default:
      return `https://urlscan.io/search/#${q}`;
  }
}

function buildAbuseIpDbUrl({ type, value }: IntelQueryParams): string | null {
  const q = encodeURIComponent(value);
  switch (type) {
    case 'ipv4':
    case 'ipv6':
      return `https://www.abuseipdb.com/check/${q}`;
    default:
      return null;
  }
}

function buildShodanUrl({ type, value }: IntelQueryParams): string | null {
  const q = encodeURIComponent(value);
  switch (type) {
    case 'ipv4':
    case 'ipv6':
      return `https://www.shodan.io/host/${q}`;
    case 'domain':
      return `https://www.shodan.io/domain/${q}`;
    default:
      return `https://www.shodan.io/search?query=${q}`;
  }
}

function buildCensysUrl({ type, value }: IntelQueryParams): string | null {
  const q = encodeURIComponent(value);
  switch (type) {
    case 'ipv4':
    case 'ipv6':
      return `https://search.censys.io/hosts/${q}`;
    case 'domain':
      return `https://search.censys.io/search?resource=hosts&q=${q}`;
    case 'as':
      return `https://search.censys.io/search?resource=hosts&q=autonomous_system.asn:${q.replace(/^ASN?\s*/i, '')}`;
    default:
      return `https://search.censys.io/search?q=${q}`;
  }
}

function buildAnyRunUrl({ type, value }: IntelQueryParams): string | null {
  const q = encodeURIComponent(value);
  switch (type) {
    case 'md5':
    case 'sha1':
    case 'sha256':
    case 'sha512':
      return `https://app.any.run/submissions/#filehash:${q}`;
    case 'ipv4':
    case 'domain':
    case 'url':
      return `https://app.any.run/submissions/#${q}`;
    default:
      return `https://app.any.run/submissions/#${q}`;
  }
}

function buildTriageUrl({ type, value }: IntelQueryParams): string | null {
  const q = encodeURIComponent(value);
  switch (type) {
    case 'md5':
    case 'sha1':
    case 'sha256':
    case 'sha512':
      return `https://tria.ge/search?q=${q}`;
    case 'ipv4':
    case 'domain':
    case 'url':
      return `https://tria.ge/search?q=${q}`;
    default:
      return `https://tria.ge/search?q=${q}`;
  }
}

// ================================================================
// 情报源定义表
// ================================================================

export const INTEL_SOURCES: IntelSource[] = [
  {
    id: 'virustotal',
    name: 'VirusTotal',
    nameEn: 'VirusTotal',
    description: '全球最大的多引擎病毒扫描与威胁情报聚合平台',
    icon: '🛡️',
    color: '#394eff',
    homepage: 'https://www.virustotal.com',
    supportedTypes: ['ipv4', 'ipv6', 'domain', 'url', 'md5', 'sha1', 'sha256', 'sha512', 'email', 'cve', 'as'],
    buildUrl: buildVirusTotalUrl,
  },
  {
    id: 'threatbook',
    name: '微步威胁情报',
    nameEn: 'ThreatBook',
    description: '国内领先的威胁情报平台（X 情报中心）',
    icon: '🔴',
    color: '#f5222d',
    homepage: 'https://x.threatbook.com',
    supportedTypes: ['ipv4', 'ipv6', 'domain', 'url', 'md5', 'sha1', 'sha256', 'sha512', 'email', 'cve'],
    buildUrl: buildThreatBookUrl,
  },
  {
    id: 'alienvault',
    name: 'AlienVault OTX',
    nameEn: 'AlienVault OTX',
    description: '开放威胁情报共享平台，支持社区 Pulse 订阅',
    icon: '👽',
    color: '#5dbb63',
    homepage: 'https://otx.alienvault.com',
    supportedTypes: ['ipv4', 'ipv6', 'domain', 'url', 'md5', 'sha1', 'sha256', 'sha512', 'cve'],
    buildUrl: buildAlienVaultUrl,
  },
  {
    id: 'hybrid-analysis',
    name: 'Hybrid Analysis',
    nameEn: 'Hybrid Analysis',
    description: 'CrowdStrike 免费沙箱与恶意软件分析平台',
    icon: '🧪',
    color: '#e74c3c',
    homepage: 'https://www.hybrid-analysis.com',
    supportedTypes: ['ipv4', 'ipv6', 'domain', 'url', 'md5', 'sha1', 'sha256', 'sha512'],
    buildUrl: buildHybridAnalysisUrl,
  },
  {
    id: 'urlscan',
    name: 'URLScan.io',
    nameEn: 'URLScan.io',
    description: '网站自动扫描与截图分析平台',
    icon: '🔍',
    color: '#f59e0b',
    homepage: 'https://urlscan.io',
    supportedTypes: ['ipv4', 'ipv6', 'domain', 'url', 'sha256', 'as'],
    buildUrl: buildUrlscanUrl,
  },
  {
    id: 'abuseipdb',
    name: 'AbuseIPDB',
    nameEn: 'AbuseIPDB',
    description: 'IP 地址滥用投诉数据库与黑名单检查',
    icon: '🚫',
    color: '#dc2626',
    homepage: 'https://www.abuseipdb.com',
    supportedTypes: ['ipv4', 'ipv6'],
    buildUrl: buildAbuseIpDbUrl,
  },
  {
    id: 'shodan',
    name: 'Shodan',
    nameEn: 'Shodan',
    description: '物联网与联网设备搜索引擎',
    icon: '🌐',
    color: '#0d0d0d',
    homepage: 'https://www.shodan.io',
    supportedTypes: ['ipv4', 'ipv6', 'domain', 'as'],
    buildUrl: buildShodanUrl,
  },
  {
    id: 'censys',
    name: 'Censys',
    nameEn: 'Censys',
    description: '互联网资产测绘与证书搜索引擎',
    icon: '📡',
    color: '#1e40af',
    homepage: 'https://search.censys.io',
    supportedTypes: ['ipv4', 'ipv6', 'domain', 'as'],
    buildUrl: buildCensysUrl,
  },
  {
    id: 'anyrun',
    name: 'ANY.RUN',
    nameEn: 'ANY.RUN',
    description: '交互式在线沙箱，支持手动操作虚拟机',
    icon: '🖥️',
    color: '#0891b2',
    homepage: 'https://app.any.run',
    supportedTypes: ['md5', 'sha1', 'sha256', 'sha512', 'ipv4', 'domain', 'url'],
    buildUrl: buildAnyRunUrl,
  },
  {
    id: 'triage',
    name: 'Triage',
    nameEn: 'Triage',
    description: 'Hatching 自动化沙箱平台',
    icon: '📋',
    color: '#7c3aed',
    homepage: 'https://tria.ge',
    supportedTypes: ['md5', 'sha1', 'sha256', 'sha512', 'ipv4', 'domain', 'url'],
    buildUrl: buildTriageUrl,
  },
];

// ================================================================
// 工具函数
// ================================================================

export function getIntelSource(id: IntelSourceType): IntelSource | undefined {
  return INTEL_SOURCES.find((s) => s.id === id);
}

export function getIntelSourcesByType(type: IocType): IntelSource[] {
  return INTEL_SOURCES.filter((s) => s.supportedTypes.includes(type));
}

export function buildAllIntelLinks(params: IntelQueryParams): Array<{ source: IntelSourceType; name: string; url: string }> {
  const results: Array<{ source: IntelSourceType; name: string; url: string }> = [];
  for (const src of INTEL_SOURCES) {
    if (!src.supportedTypes.includes(params.type)) continue;
    const url = src.buildUrl(params);
    if (url) {
      results.push({ source: src.id, name: src.name, url });
    }
  }
  return results;
}

export function buildIntelLink(sourceId: IntelSourceType, params: IntelQueryParams): string | null {
  const src = getIntelSource(sourceId);
  if (!src || !src.supportedTypes.includes(params.type)) return null;
  return src.buildUrl(params);
}
