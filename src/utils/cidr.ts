// ============================================================
// CIDR / IP 聚合模块 — 实现
// ============================================================
import type { ToolResult } from '../types';

function success<T>(data: T, metadata?: Record<string, string>): ToolResult<T> {
  return { success: true, data, error: null, metadata: metadata ?? null };
}

function fail(error: string): ToolResult<never> {
  return { success: false, data: undefined as never, error, metadata: null };
}

// ================================================================
// 基础类型
// ================================================================

export interface IpRange {
  start: string;
  end: string;
}

export interface CidrInfo {
  cidr: string;
  network: string;
  netmask: string;
  wildcard: string;
  broadcast: string;
  firstHost: string;
  lastHost: string;
  totalHosts: number;
  usableHosts: number;
  ipClass: string;
  isPrivate: boolean;
}

export interface AggregateResult {
  originalCount: number;
  aggregatedCount: number;
  cidrs: string[];
  summary: string;
}

// ================================================================
// 内部辅助：IPv4 转 uint32
// ================================================================

function ipToUint(ip: string): number {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) throw new Error('INVALID_IP');
  let result = 0;
  for (const p of parts) {
    const n = parseInt(p, 10);
    if (isNaN(n) || n < 0 || n > 255) throw new Error('INVALID_IP');
    result = (result << 8) | n;
  }
  return result >>> 0;
}

function uintToIp(n: number): string {
  return [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ].join('.');
}

function prefixToMaskUint(prefix: number): number {
  if (prefix <= 0) return 0;
  if (prefix >= 32) return 0xffffffff >>> 0;
  return (0xffffffff << (32 - prefix)) >>> 0;
}

function isPrivateIpUint(n: number): boolean {
  return (
    ((n >>> 24) === 10) ||
    (((n >>> 16) & 0xffff) >= 0xac10 && ((n >>> 16) & 0xffff) <= 0xac1f) ||
    (((n >>> 16) & 0xffff) === 0xc0a8) ||
    ((n >>> 8) === 0xa9fe) ||
    ((n >>> 24) === 127) ||
    ((n >>> 24) === 0) ||
    (n >= 0xe0000000 && n <= 0xefffffff)
  );
}

function getIpClass(firstOctet: number): string {
  if (firstOctet < 128) return 'A';
  if (firstOctet < 192) return 'B';
  if (firstOctet < 224) return 'C';
  if (firstOctet < 240) return 'D (组播)';
  return 'E (保留)';
}

// ================================================================
// 解析 CIDR / IP 范围
// ================================================================

function parseCidr(cidr: string): { networkUint: number; prefix: number } {
  const trimmed = cidr.trim();
  const parts = trimmed.split('/');
  if (parts.length !== 2) throw new Error('INVALID_CIDR');
  const networkUint = ipToUint(parts[0]);
  const prefix = parseInt(parts[1], 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) throw new Error('INVALID_PREFIX');
  const mask = prefixToMaskUint(prefix);
  return { networkUint: (networkUint & mask) >>> 0, prefix };
}

// ================================================================
// CIDR 详细信息
// ================================================================

export function cidrInfo(input: string): ToolResult<CidrInfo> {
  if (!input?.trim()) return fail('EMPTY_INPUT');

  try {
    const trimmed = input.trim();
    let networkUint: number;
    let prefix: number;

    if (trimmed.includes('/')) {
      const parsed = parseCidr(trimmed);
      networkUint = parsed.networkUint;
      prefix = parsed.prefix;
    } else {
      networkUint = ipToUint(trimmed);
      prefix = 32;
    }

    const maskUint = prefixToMaskUint(prefix);
    const wildcardUint = (~maskUint) >>> 0;
    const broadcastUint = (networkUint | wildcardUint) >>> 0;

    const totalHosts = prefix >= 32 ? 1 : (1 << (32 - prefix));
    let usableHosts: number;
    if (prefix === 32) usableHosts = 1;
    else if (prefix === 31) usableHosts = 2;
    else usableHosts = totalHosts - 2;

    const firstHostUint = prefix >= 31 ? networkUint : networkUint + 1;
    const lastHostUint = prefix >= 31 ? broadcastUint : broadcastUint - 1;

    const firstOctet = (networkUint >>> 24) & 0xff;

    return success({
      cidr: `${uintToIp(networkUint)}/${prefix}`,
      network: uintToIp(networkUint),
      netmask: uintToIp(maskUint),
      wildcard: uintToIp(wildcardUint),
      broadcast: uintToIp(broadcastUint),
      firstHost: uintToIp(firstHostUint >>> 0),
      lastHost: uintToIp(lastHostUint >>> 0),
      totalHosts,
      usableHosts,
      ipClass: getIpClass(firstOctet),
      isPrivate: isPrivateIpUint(networkUint),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'INVALID_IP') return fail('INVALID_IP');
    if (msg === 'INVALID_CIDR') return fail('INVALID_CIDR_FORMAT');
    if (msg === 'INVALID_PREFIX') return fail('INVALID_PREFIX');
    return fail('PARSE_ERROR: ' + msg);
  }
}

// ================================================================
// IP 列表 → CIDR 列表
// ================================================================

export function ipListToCidrs(input: string): ToolResult<string[]> {
  if (!input?.trim()) return fail('EMPTY_INPUT');

  try {
    const lines = input.split(/[\s,;\n\r]+/).map(s => s.trim()).filter(Boolean);
    if (lines.length === 0) return fail('NO_IPS');

    const ranges: { start: number; end: number }[] = [];

    for (const line of lines) {
      if (line.includes('/')) {
        const { networkUint, prefix } = parseCidr(line);
        const mask = prefixToMaskUint(prefix);
        const wildcard = (~mask) >>> 0;
        ranges.push({ start: networkUint, end: (networkUint | wildcard) >>> 0 });
      } else if (line.includes('-')) {
        const [s, e] = line.split('-').map(p => p.trim());
        ranges.push({ start: ipToUint(s), end: ipToUint(e) });
      } else {
        const ip = ipToUint(line);
        ranges.push({ start: ip, end: ip });
      }
    }

    const merged = mergeRanges(ranges);
    const cidrs = rangesToCidrs(merged);

    return success(cidrs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'INVALID_IP') return fail('INVALID_IP');
    if (msg === 'INVALID_CIDR') return fail('INVALID_CIDR_FORMAT');
    if (msg === 'INVALID_PREFIX') return fail('INVALID_PREFIX');
    return fail('PARSE_ERROR: ' + msg);
  }
}

// ================================================================
// CIDR 聚合
// ================================================================

export function cidrAggregate(input: string): ToolResult<AggregateResult> {
  const cidrRes = ipListToCidrs(input);
  if (!cidrRes.success) return fail(cidrRes.error ?? 'AGGREGATE_FAILED');

  const cidrs = cidrRes.data;

  let changed = true;
  let current = [...cidrs];

  while (changed) {
    changed = false;
    const parsed = current.map(c => parseCidr(c)).sort((a, b) => {
      if (a.networkUint !== b.networkUint) return a.networkUint - b.networkUint;
      return a.prefix - b.prefix;
    });

    const result: { networkUint: number; prefix: number }[] = [];
    let i = 0;

    while (i < parsed.length) {
      if (i + 1 < parsed.length) {
        const a = parsed[i];
        const b = parsed[i + 1];

        if (a.prefix === b.prefix && a.prefix > 0) {
          const superPrefix = a.prefix - 1;
          const superMask = prefixToMaskUint(superPrefix);
          const superNetA = (a.networkUint & superMask) >>> 0;
          const superNetB = (b.networkUint & superMask) >>> 0;

          if (superNetA === superNetB) {
            result.push({ networkUint: superNetA, prefix: superPrefix });
            i += 2;
            changed = true;
            continue;
          }
        }
      }
      result.push(parsed[i]);
      i++;
    }

    current = result.map(r => `${uintToIp(r.networkUint)}/${r.prefix}`);
  }

  const originalCount = cidrs.length;
  const aggregatedCount = current.length;
  const summary = `原 ${originalCount} 条 → 聚合后 ${aggregatedCount} 条，精简 ${((1 - aggregatedCount / originalCount) * 100).toFixed(1)}%`;

  return success({
    originalCount,
    aggregatedCount,
    cidrs: current,
    summary,
  });
}

// ================================================================
// 判断 IP 是否属于 CIDR
// ================================================================

export function ipInCidr(ip: string, cidr: string): ToolResult<{ inRange: boolean; cidr: string; ip: string }> {
  if (!ip?.trim()) return fail('EMPTY_IP');
  if (!cidr?.trim()) return fail('EMPTY_CIDR');

  try {
    const ipUint = ipToUint(ip.trim());
    const { networkUint, prefix } = parseCidr(cidr.trim());
    const mask = prefixToMaskUint(prefix);
    const inRange = (ipUint & mask) >>> 0 === networkUint;

    return success({
      inRange,
      cidr: `${uintToIp(networkUint)}/${prefix}`,
      ip: uintToIp(ipUint),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'INVALID_IP') return fail('INVALID_IP');
    if (msg === 'INVALID_CIDR') return fail('INVALID_CIDR_FORMAT');
    if (msg === 'INVALID_PREFIX') return fail('INVALID_PREFIX');
    return fail('PARSE_ERROR: ' + msg);
  }
}

// ================================================================
// CIDR → IP 范围展开（仅小范围，限制条数）
// ================================================================

export function cidrExpand(cidr: string, limit: number = 1000): ToolResult<{ ips: string[]; total: number; truncated: boolean }> {
  if (!cidr?.trim()) return fail('EMPTY_INPUT');

  try {
    const { networkUint, prefix } = parseCidr(cidr.trim());

    const total = prefix >= 32 ? 1 : (1 << (32 - prefix));
    const ips: string[] = [];
    const count = Math.min(total, limit);

    for (let i = 0; i < count; i++) {
      ips.push(uintToIp((networkUint + i) >>> 0));
    }

    return success({
      ips,
      total,
      truncated: total > limit,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'INVALID_IP') return fail('INVALID_IP');
    if (msg === 'INVALID_CIDR') return fail('INVALID_CIDR_FORMAT');
    if (msg === 'INVALID_PREFIX') return fail('INVALID_PREFIX');
    return fail('PARSE_ERROR: ' + msg);
  }
}

// ================================================================
// 内部辅助：合并区间
// ================================================================

function mergeRanges(ranges: { start: number; end: number }[]): { start: number; end: number }[] {
  if (ranges.length === 0) return [];

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const result: { start: number; end: number }[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const last = result[result.length - 1];
    const cur = sorted[i];

    if (cur.start <= last.end + 1) {
      last.end = Math.max(last.end, cur.end);
    } else {
      result.push({ ...cur });
    }
  }

  return result;
}

// ================================================================
// 内部辅助：区间 → CIDR 列表
// ================================================================

function rangesToCidrs(ranges: { start: number; end: number }[]): string[] {
  const cidrs: string[] = [];

  for (const range of ranges) {
    let start = range.start;
    const end = range.end;

    while (start <= end) {
      let maxSize = 1;
      while (maxSize < 0x100000000) {
        const prefix = 32 - Math.log2(maxSize);
        const mask = prefixToMaskUint(prefix);
        const nextSize = maxSize << 1;
        const nextPrefix = 32 - Math.log2(nextSize);
        const nextMask = prefixToMaskUint(nextPrefix);

        if (
          ((start & mask) >>> 0) === start &&
          start + nextSize - 1 <= end &&
          ((start & nextMask) >>> 0) === start
        ) {
          maxSize = nextSize;
        } else {
          break;
        }
      }

      const prefix = 32 - (maxSize === 1 ? 0 : Math.log2(maxSize));
      cidrs.push(`${uintToIp(start)}/${prefix}`);

      if (maxSize >= 0x100000000) break;
      start = (start + maxSize) >>> 0;
      if (start === 0) break;
    }
  }

  return cidrs;
}
