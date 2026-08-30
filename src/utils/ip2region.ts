// ============================================================
// ip2region v1 db 纯 JS 解析模块（浏览器兼容，Uint8Array + DataView）
// 基于 npm ip2region@2.3.0 附带的 v1 ip2region.db 格式
// ============================================================
import type { ToolResult } from '../types';

function success<T>(data: T, metadata?: Record<string, string>): ToolResult<T> {
  return { success: true, data, error: null, metadata: metadata ?? null };
}

function fail(error: string): ToolResult<never> {
  return { success: false, data: undefined as never, error, metadata: null };
}

// ================================================================
// v1 db 格式常量
// ================================================================

const SUPER_BLOCK_SIZE = 8;      // [firstIndexPtr LE u32 | lastIndexPtr LE u32]
const INDEX_BLOCK_SIZE = 12;     // [startIp LE u32 | endIp LE u32 | dataPtr LE u32]

// ================================================================
// 基础类型
// ================================================================

export interface Ip2RegionResult {
  country: string;
  region: string;
  province: string;
  city: string;
  isp: string;
  raw: string;
  ip: string;
  ipUint: number;
}

export interface XdbSearchMode {
  mode: 'memory';
  description: string;
}

// ================================================================
// IP <-> uint32
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

// ================================================================
// Uint8Array 小工具（纯 JS，无 Node Buffer）
// ================================================================

function getUint32LE(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset] |
      (buf[offset + 1] << 8) |
      (buf[offset + 2] << 16) |
      (buf[offset + 3] << 24)) >>>
    0
  );
}

function utf8Decode(buf: Uint8Array, offset: number, length: number): string {
  // TextDecoder 浏览器原生可用，Chrome extension 100% 支持
  return new TextDecoder('utf-8').decode(buf.subarray(offset, offset + length));
}

// ================================================================
// 解析 Region 字符串
// ================================================================

function parseRegion(raw: string, ip: string, ipUint: number): Ip2RegionResult {
  // 原始格式：城市Id|国家|区域|省份|城市|ISP
  const parts = raw.split('|');
  const get = (i: number) => (parts[i] && parts[i] !== '0' ? parts[i] : '');

  return {
    country: get(1),
    region: get(2),
    province: get(3),
    city: get(4),
    isp: get(5),
    raw,
    ip,
    ipUint,
  };
}

// ================================================================
// DbSearcher：纯内存模式（v1 db）
// 继续叫 XdbSearcher 是为了 UI 不改动 import 名称
// ================================================================

export class XdbSearcher {
  private data: Uint8Array;
  private firstIndexPtr: number;
  private totalBlocks: number;

  constructor(data: Uint8Array) {
    this.data = data;

    if (data.length < SUPER_BLOCK_SIZE + INDEX_BLOCK_SIZE) {
      throw new Error('DB_TOO_SMALL: 无效的 ip2region db 文件，文件过小');
    }

    // 1. 读 Super Block
    const firstIndexPtr = getUint32LE(data, 0);
    const lastIndexPtr = getUint32LE(data, 4);
    const totalBlocks = ((lastIndexPtr - firstIndexPtr) / INDEX_BLOCK_SIZE) + 1;

    if (!Number.isInteger(totalBlocks) || totalBlocks < 1) {
      throw new Error('DB_INVALID: Super block 无效，无法计算索引块总数');
    }
    if (lastIndexPtr + INDEX_BLOCK_SIZE > data.length) {
      throw new Error('DB_INVALID: lastIndexPtr 超出文件大小，db 文件不完整');
    }

    this.firstIndexPtr = firstIndexPtr;
    this.totalBlocks = totalBlocks;
  }

  /**
   * 纯内存模式搜索
   * @param ip IPv4 字符串
   */
  search(ip: string): Ip2RegionResult | null {
    try {
      const ipUint = ipToUint(ip);
      return this.searchByUint(ipUint, ip);
    } catch {
      return null;
    }
  }

  /**
   * 内部：按 uint32 二分查
   */
  private searchByUint(ipUint: number, ipStr: string): Ip2RegionResult | null {
    let low = 0;
    let high = this.totalBlocks - 1;
    let dataPos = 0;

    while (low <= high) {
      const mid = (low + high) >>> 1;
      const pos = this.firstIndexPtr + mid * INDEX_BLOCK_SIZE;
      const sip = getUint32LE(this.data, pos);

      if (ipUint < sip) {
        high = mid - 1;
      } else {
        const eip = getUint32LE(this.data, pos + 4);
        if (ipUint > eip) {
          low = mid + 1;
        } else {
          dataPos = getUint32LE(this.data, pos + 8);
          break;
        }
      }
    }

    if (dataPos === 0) return null;

    // 高 8 bits = dataLen（含 city_id 4 bytes + region string）
    const dataLen = (dataPos >>> 24) & 0xff;
    // 低 24 bits = 实际数据起始地址
    const dataOffset = dataPos & 0x00ffffff;

    if (dataOffset + dataLen > this.data.length) return null;

    // data 区域：city_id LE u32 + utf-8 字符串（dataLen - 4 bytes）
    const regionBytesLen = dataLen - 4;
    if (regionBytesLen < 0) return null;

    const raw = utf8Decode(this.data, dataOffset + 4, regionBytesLen);
    return parseRegion(raw, ipStr, ipUint);
  }

  /** 释放内存（纯 GC 语言里这只是提示） */
  close(): void {
    // noop，Uint8Array 由 GC 回收
  }
}

// ================================================================
// 数据加载：从 URL fetch 并显示进度（支持本地扩展资源 URL 和 http/https URL）
// ================================================================

export async function loadXdbFromUrl(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<XdbSearcher> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`FETCH_FAILED: HTTP ${resp.status}`);
  }
  const total = Number(resp.headers.get('content-length') || '0');

  if (onProgress && resp.body && typeof (resp.body as unknown as { getReader?: () => ReadableStreamDefaultReader<Uint8Array> }).getReader === 'function') {
    const reader = resp.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loaded += value.length;
        try { onProgress(loaded, total); } catch { /* ignore */ }
      }
    }
    // concat chunks
    const totalBytes = chunks.reduce((s, c) => s + c.length, 0);
    const combined = new Uint8Array(totalBytes);
    let offset = 0;
    for (const c of chunks) {
      combined.set(c, offset);
      offset += c.length;
    }
    return new XdbSearcher(combined);
  }

  const buf = await resp.arrayBuffer();
  if (onProgress) onProgress(buf.byteLength, buf.byteLength);
  return new XdbSearcher(new Uint8Array(buf));
}

// ================================================================
// 顶层工具函数（供 UI 调用）
// ================================================================

export function ip2RegionSearch(
  searcher: XdbSearcher | null,
  ip: string,
): ToolResult<Ip2RegionResult | null> {
  if (!searcher) return fail('请先加载 ip2region 数据库');
  try {
    return success(searcher.search(ip));
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'SEARCH_ERROR');
  }
}

export function ip2RegionBatchSearch(
  searcher: XdbSearcher | null,
  ips: string | string[],
): ToolResult<Array<{ ip: string; result: Ip2RegionResult | null; error?: string }>> {
  if (!searcher) return fail('请先加载 ip2region 数据库');
  const list: string[] = Array.isArray(ips)
    ? ips
    : ips
        .split(/[\n,;，；\s]+/g)
        .map((s) => s.trim())
        .filter(Boolean);
  const out: Array<{ ip: string; result: Ip2RegionResult | null; error?: string }> = [];
  for (const ip of list) {
    try {
      const r = searcher.search(ip.trim());
      out.push({ ip, result: r });
    } catch (e) {
      out.push({ ip, result: null, error: e instanceof Error ? e.message : 'ERROR' });
    }
  }
  return success(out);
}
