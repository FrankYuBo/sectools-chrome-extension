// ============================================================
// 生成器工具
// 提供 UUID、随机字符串、随机密码、随机整数、随机字节等常见安全工具
// 所有函数返回统一的 ToolResult<T> 结构
// ============================================================
import type { ToolResult } from '../types';

function success<T>(data: T, metadata?: Record<string, string>): ToolResult<T> {
  return { success: true, data, error: null, metadata: metadata ?? null };
}

function failure(error: string): ToolResult<never> {
  return { success: false, data: undefined as never, error, metadata: null };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.<>?';

export type UuidVersion = 'v4' | 'v1' | 'v7';

function getCryptoRandomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 生成 UUID（v4 / v1 / v7 占位实现，均为随机版本） */
export function generateUuid(version: UuidVersion = 'v4'): ToolResult<string> {
  void version; // 当前统一按 v4（随机）实现
  try {
    const bytes = getCryptoRandomBytes(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
    const hex = bytesToHex(bytes);
    const uuid =
      `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
      `${hex.slice(16, 20)}-${hex.slice(20)}`;
    return success(uuid);
  } catch (e) {
    return failure(`生成 UUID 失败: ${(e as Error).message}`);
  }
}

export interface PasswordOptions {
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean; // 排除易混淆字符 0O1lI
}

const AMBIGUOUS = new Set(['0', 'O', '1', 'l', 'I']);

/** 生成强随机密码 */
export function generatePassword(opts: PasswordOptions): ToolResult<string> {
  const { length, lower, upper, digits, symbols, excludeAmbiguous } = opts;
  if (!Number.isInteger(length) || length < 1 || length > 256) {
    return failure('密码长度需为 1-256 之间的整数');
  }
  let pool = '';
  if (lower) pool += LOWER;
  if (upper) pool += UPPER;
  if (digits) pool += DIGITS;
  if (symbols) pool += SYMBOLS;
  if (excludeAmbiguous) {
    pool = pool
      .split('')
      .filter((c) => !AMBIGUOUS.has(c))
      .join('');
  }
  if (!pool) {
    return failure('请至少选择一种字符类型');
  }
  const bytes = getCryptoRandomBytes(length * 2);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += pool[bytes[i] % pool.length];
  }
  return success(out);
}

/** 生成随机字符串（指定字符集与长度） */
export function generateRandomString(
  length: number,
  charset: 'alphanumeric' | 'alphabetic' | 'numeric' | 'hex' | 'all' = 'alphanumeric',
): ToolResult<string> {
  if (!Number.isInteger(length) || length < 1 || length > 4096) {
    return failure('长度需为 1-4096 之间的整数');
  }
  const map: Record<string, string> = {
    alphanumeric: LOWER + UPPER + DIGITS,
    alphabetic: LOWER + UPPER,
    numeric: DIGITS,
    hex: DIGITS + 'abcdef',
    all: LOWER + UPPER + DIGITS + SYMBOLS,
  };
  const pool = map[charset];
  const bytes = getCryptoRandomBytes(length * 2);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += pool[bytes[i] % pool.length];
  }
  return success(out);
}

/** 生成 [min, max] 闭区间内的随机整数 */
export function generateRandomInt(min: number, max: number): ToolResult<number> {
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    return failure('上下界必须为整数');
  }
  if (min > max) {
    return failure('下界不能大于上界');
  }
  const range = max - min + 1;
  if (range > Number.MAX_SAFE_INTEGER) {
    return failure('范围过大，超出安全整数上限');
  }
  // 拒绝采样以避免取模偏差
  const limit = Math.floor(256 / range) * range;
  let v: number;
  do {
    v = getCryptoRandomBytes(1)[0];
  } while (v >= limit);
  return success(min + (v % range));
}

/** 生成随机十六进制字节串（默认 16 字节 = 32 字符） */
export function generateRandomBytes(count = 16): ToolResult<string> {
  if (!Number.isInteger(count) || count < 1 || count > 1024) {
    return failure('字节数需为 1-1024 之间的整数');
  }
  return success(bytesToHex(getCryptoRandomBytes(count)));
}

/** 校验字符串是否为合法 UUID */
export function isValidUuid(value: string): ToolResult<boolean> {
  return success(UUID_RE.test(value.trim()));
}
