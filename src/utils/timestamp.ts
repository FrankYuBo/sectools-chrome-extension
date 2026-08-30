// ============================================================
// 时间转换模块 — 实现
// 由 .spec/timestamp.spec.yaml 驱动
// ============================================================
import type { ToolResult, TimestampUnit, DateTimeInfo } from '../types';

// --- 工具函数 ---

function success<T>(data: T, metadata?: Record<string, string>): ToolResult<T> {
  return { success: true, data, error: null, metadata: metadata ?? null };
}

function fail(error: string): ToolResult<never> {
  return { success: false, data: undefined as never, error, metadata: null };
}

// ================================================================
// 常量
// ================================================================

// Windows FILETIME epoch: 1601-01-01 00:00:00 UTC
// 与 Unix epoch (1970-01-01) 相差 11644473600 秒
const FILETIME_EPOCH_DIFF = 11644473600n;
// 1 秒 = 10,000,000 个 100ns 间隔
const HNS_PER_SECOND = 10000000n;

// ================================================================
// 时间戳 ↔ 人类可读
// ================================================================

/**
 * 自动检测时间戳单位：
 * - 10^12 ≤ val < 10^14 → 毫秒
 * - 10^15 ≤ val < 10^17 → 微秒
 * - ≥ 10^17 → 纳秒
 * - < 10^12 → 秒
 */
function detectUnit(timestamp: number | bigint | string): TimestampUnit {
  const s = String(timestamp).replace(/[^0-9]/g, '');
  const len = s.length;

  if (len >= 17) return 'ns';
  if (len >= 15) return 'us';
  if (len >= 12) return 'ms';
  return 's';
}

function toMillis(raw: number | bigint | string, unit?: TimestampUnit): number {
  const resolved = unit ?? detectUnit(raw);
  const val = typeof raw === 'bigint' ? raw : BigInt(String(raw).replace(/[^0-9-]/g, ''));

  switch (resolved) {
    case 's': return Number(val) * 1000;
    case 'ms': return Number(val);
    case 'us': return Math.floor(Number(val) / 1000);
    case 'ns': return Math.floor(Number(val) / 1000000);
    default: return Number(val);
  }
}

export function timestampToHuman(
  timestamp: number | bigint | string,
  unit?: TimestampUnit,
  _format?: 'iso' | 'local' | 'utc',
): ToolResult<DateTimeInfo> {
  if (timestamp === undefined || timestamp === null || String(timestamp).trim() === '') {
    return fail('EMPTY_INPUT');
  }

  try {
    const resolvedUnit = unit ?? detectUnit(timestamp);
    const millis = toMillis(timestamp, resolvedUnit);

    if (isNaN(millis)) return fail('INVALID_TIMESTAMP');

    const date = new Date(millis);

    // YYYY-MM-DD HH:mm:ss 格式
    const datetime = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-') + ' ' + [
      String(date.getHours()).padStart(2, '0'),
      String(date.getMinutes()).padStart(2, '0'),
      String(date.getSeconds()).padStart(2, '0'),
    ].join(':');

    return success({
      timestamp: String(timestamp),
      detectedUnit: resolvedUnit,
      iso8601: date.toISOString(),
      local: date.toLocaleString('zh-CN', { timeZoneName: 'short' }),
      utc: date.toUTCString(),
      datetime,
      unixSeconds: Math.floor(millis / 1000),
      unixMillis: millis,
    });
  } catch {
    return fail('INVALID_TIMESTAMP');
  }
}

export function humanToTimestamp(
  dateString: string,
  targetUnit: TimestampUnit = 's',
): ToolResult<number | bigint> {
  if (!dateString?.trim()) return fail('EMPTY_INPUT');

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return fail('INVALID_DATE_STRING');

  const millis = date.getTime();

  switch (targetUnit) {
    case 's': return success(Math.floor(millis / 1000));
    case 'ms': return success(millis);
    case 'us': return success(BigInt(millis) * 1000n);
    case 'ns': return success(BigInt(millis) * 1000000n);
    default: return success(Math.floor(millis / 1000));
  }
}

export function getCurrentTimestamp(unit: TimestampUnit = 's'): ToolResult<{ timestamp: number | bigint; human: string }> {
  const millis = Date.now();

  let timestamp: number | bigint;
  switch (unit) {
    case 's': timestamp = Math.floor(millis / 1000); break;
    case 'ms': timestamp = millis; break;
    case 'us': timestamp = BigInt(millis) * 1000n; break;
    case 'ns': timestamp = BigInt(millis) * 1000000n; break;
    default: timestamp = Math.floor(millis / 1000); break;
  }

  return success({
    timestamp,
    human: new Date(millis).toISOString(),
  });
}

// ================================================================
// FILETIME 转换
// ================================================================

export function filetimeToHuman(
  filetime: bigint | string,
): ToolResult<DateTimeInfo> {
  if (filetime === undefined || filetime === null || String(filetime).trim() === '') {
    return fail('EMPTY_INPUT');
  }

  try {
    const ft = typeof filetime === 'bigint' ? filetime : BigInt(String(filetime).replace(/[^0-9-]/g, ''));

    // FILETIME: 100ns intervals since 1601-01-01
    // Convert to Unix milliseconds
    const unixNanos = (ft - FILETIME_EPOCH_DIFF * HNS_PER_SECOND);

    // Convert 100ns to milliseconds (divide by 10000)
    const millis = Number(unixNanos / 10000n);

    if (isNaN(millis)) return fail('INVALID_FILETIME');

    const date = new Date(millis);

    const datetime = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-') + ' ' + [
      String(date.getHours()).padStart(2, '0'),
      String(date.getMinutes()).padStart(2, '0'),
      String(date.getSeconds()).padStart(2, '0'),
    ].join(':');

    return success({
      timestamp: String(filetime),
      detectedUnit: '100ns',
      iso8601: date.toISOString(),
      local: date.toLocaleString('zh-CN', { timeZoneName: 'short' }),
      utc: date.toUTCString(),
      datetime,
      unixSeconds: Math.floor(millis / 1000),
      unixMillis: millis,
    });
  } catch {
    return fail('INVALID_FILETIME');
  }
}

export function humanToFiletime(
  dateString: string,
): ToolResult<bigint> {
  if (!dateString?.trim()) return fail('EMPTY_INPUT');

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return fail('INVALID_DATE_STRING');

  // Unix milliseconds → 100ns intervals → add epoch diff
  const millis = BigInt(date.getTime());
  const hns = millis * 10000n;
  const filetime = hns + FILETIME_EPOCH_DIFF * HNS_PER_SECOND;

  return success(filetime);
}
