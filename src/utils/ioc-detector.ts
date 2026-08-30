// ============================================================
// IOC 检测器 — 从文本中提取妥协指标
// 支持 IPv4/IPv6/域名/URL/邮箱/各类哈希/CVE/加密货币地址等
// ============================================================
import type { IocType, IocMatch, IocDetectResult, ToolResult } from '../types';
import { BUILTIN_IOC_REGEXES, getSortedRegexes } from './builtin-regex';

// --- 工具函数 ---

function success<T>(data: T, metadata?: Record<string, string>): ToolResult<T> {
  return { success: true, data, error: null, metadata: metadata ?? null };
}

function fail(error: string): ToolResult<never> {
  return { success: false, data: undefined as never, error, metadata: null };
}

// ================================================================
// 去重：同类型 + 同值只保留第一个（记录所有位置）
// ================================================================

interface DedupKey {
  type: IocType;
  value: string;
}

function dedupMatches(matches: IocMatch[]): IocMatch[] {
  const seen = new Set<string>();
  const result: IocMatch[] = [];
  for (const m of matches) {
    const k: DedupKey = { type: m.type, value: m.value };
    const key = `${k.type}:${k.value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(m);
  }
  return result;
}

// ================================================================
// 解决重叠匹配冲突：按正则优先级保留高优先级的匹配
// ================================================================

function resolveOverlaps(matches: IocMatch[]): IocMatch[] {
  if (matches.length <= 1) return matches;

  const typePriority: Record<IocType, number> = {} as Record<IocType, number>;
  for (const r of BUILTIN_IOC_REGEXES) {
    typePriority[r.type] = r.priority;
  }

  const sorted = [...matches].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    const pa = typePriority[a.type] ?? 0;
    const pb = typePriority[b.type] ?? 0;
    return pb - pa;
  });

  const result: IocMatch[] = [];
  for (const m of sorted) {
    const overlaps = result.some(
      (r) => (m.start < r.end && m.end > r.start),
    );
    if (!overlaps) {
      result.push(m);
      continue;
    }
    const curPrio = typePriority[m.type] ?? 0;
    const overlapPrio = result
      .filter((r) => (m.start < r.end && m.end > r.start))
      .map((r) => typePriority[r.type] ?? 0);
    const maxOverlap = Math.max(...overlapPrio, 0);
    if (curPrio > maxOverlap) {
      const filtered = result.filter(
        (r) => !(m.start < r.end && m.end > r.start),
      );
      filtered.push(m);
      result.length = 0;
      result.push(...filtered);
    }
  }
  return result.sort((a, b) => a.start - b.start);
}

// ================================================================
// 核心：从文本提取所有 IOC 匹配
// ================================================================

export interface DetectIocsOptions {
  types?: IocType[];
  extractContext?: boolean;
  contextRadius?: number;
  dedup?: boolean;
  resolveOverlap?: boolean;
  validate?: boolean;
}

const DEFAULT_OPTIONS: DetectIocsOptions = {
  types: undefined,
  extractContext: false,
  contextRadius: 30,
  dedup: true,
  resolveOverlap: true,
  validate: true,
};

export function detectIocs(
  text: string,
  options: DetectIocsOptions = DEFAULT_OPTIONS,
): ToolResult<IocDetectResult> {
  if (!text) return fail('EMPTY_INPUT');

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const patterns = opts.types
    ? BUILTIN_IOC_REGEXES.filter((r) => opts.types!.includes(r.type))
    : getSortedRegexes();

  const rawMatches: IocMatch[] = [];

  for (const pat of patterns) {
    const re = new RegExp(pat.pattern.source, pat.pattern.flags.includes('g') ? pat.pattern.flags : pat.pattern.flags + 'g');
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      let value = match[0];
      if (pat.type === 'as') {
        const num = match[1] ?? value.replace(/^ASN?\s*/i, '');
        value = `AS${num}`;
      }
      if (opts.validate && pat.validator && !pat.validator(value)) {
        continue;
      }
      const start = match.index;
      const end = start + match[0].length;
      const entry: IocMatch = {
        type: pat.type,
        value,
        start,
        end,
      };
      if (opts.extractContext) {
        const radius = opts.contextRadius ?? 30;
        const ctxStart = Math.max(0, start - radius);
        const ctxEnd = Math.min(text.length, end + radius);
        entry.context = text.substring(ctxStart, ctxEnd);
      }
      rawMatches.push(entry);
      if (match[0].length === 0) {
        re.lastIndex++;
      }
    }
  }

  let processed = rawMatches;
  if (opts.resolveOverlap) {
    processed = resolveOverlaps(processed);
  }
  if (opts.dedup) {
    processed = dedupMatches(processed);
  }

  processed.sort((a, b) => a.start - b.start);

  const stats = {} as Record<IocType, number>;
  for (const r of BUILTIN_IOC_REGEXES) {
    stats[r.type] = 0;
  }
  for (const m of processed) {
    stats[m.type] = (stats[m.type] ?? 0) + 1;
  }

  return success({
    matches: processed,
    stats,
    total: processed.length,
  }, {
    inputLength: String(text.length),
    rawMatches: String(rawMatches.length),
  });
}

// ================================================================
// 便捷函数：按类型单独提取
// ================================================================

export function extractIocByType(
  text: string,
  type: IocType,
): string[] {
  const r = detectIocs(text, { types: [type], dedup: true, resolveOverlap: false });
  if (!r.success) return [];
  return r.data.matches.map((m) => m.value);
}

export function extractHashes(
  text: string,
): { md5: string[]; sha1: string[]; sha256: string[]; sha512: string[] } {
  const r = detectIocs(text, { types: ['md5', 'sha1', 'sha256', 'sha512'] });
  const out = { md5: [] as string[], sha1: [] as string[], sha256: [] as string[], sha512: [] as string[] };
  if (!r.success) return out;
  for (const m of r.data.matches) {
    if (m.type in out) (out[m.type as keyof typeof out]).push(m.value);
  }
  return out;
}

export function extractNetworkIocs(
  text: string,
): { ipv4: string[]; ipv6: string[]; domain: string[]; url: string[]; email: string[] } {
  const r = detectIocs(text, { types: ['ipv4', 'ipv6', 'domain', 'url', 'email'] });
  const out = { ipv4: [] as string[], ipv6: [] as string[], domain: [] as string[], url: [] as string[], email: [] as string[] };
  if (!r.success) return out;
  for (const m of r.data.matches) {
    if (m.type in out) (out[m.type as keyof typeof out]).push(m.value);
  }
  return out;
}

// ================================================================
// 高亮：将文本中的 IOC 替换为带标记的格式
// ================================================================

export interface HighlightedSegment {
  text: string;
  isIoc: boolean;
  iocType?: IocType;
  iocValue?: string;
}

export function highlightIocs(
  text: string,
  options?: DetectIocsOptions,
): ToolResult<HighlightedSegment[]> {
  const r = detectIocs(text, { ...options, extractContext: false });
  if (!r.success) return fail(r.error ?? 'DETECT_FAILED');
  const matches = r.data.matches;
  if (matches.length === 0) {
    return success([{ text, isIoc: false }]);
  }
  const segments: HighlightedSegment[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start > cursor) {
      segments.push({ text: text.substring(cursor, m.start), isIoc: false });
    }
    segments.push({ text: text.substring(m.start, m.end), isIoc: true, iocType: m.type, iocValue: m.value });
    cursor = m.end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.substring(cursor), isIoc: false });
  }
  return success(segments);
}

// ================================================================
// 分类聚合：按 IOC 类型分组返回
// ================================================================

export function groupIocsByType(
  text: string,
  options?: DetectIocsOptions,
): Record<IocType, string[]> {
  const groups = {} as Record<IocType, string[]>;
  for (const r of BUILTIN_IOC_REGEXES) {
    groups[r.type] = [];
  }
  const r = detectIocs(text, options);
  if (!r.success) return groups;
  for (const m of r.data.matches) {
    if (!groups[m.type]) groups[m.type] = [];
    groups[m.type].push(m.value);
  }
  return groups;
}
