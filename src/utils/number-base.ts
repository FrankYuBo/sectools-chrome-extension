// ============================================================
// 进制转换模块 — 实现
// 由 .spec/number-base.spec.yaml 驱动
// ============================================================
import type { ToolResult, QuickConversion, BitOp } from '../types';

// --- 工具函数 ---

function success<T>(data: T, metadata?: Record<string, string>): ToolResult<T> {
  return { success: true, data, error: null, metadata: metadata ?? null };
}

function fail(error: string): ToolResult<never> {
  return { success: false, data: undefined as never, error, metadata: null };
}

// ================================================================
// 进制字符集
// ================================================================

const DIGIT_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+/';

function digitCharToValue(ch: string): number {
  const idx = DIGIT_CHARS.indexOf(ch);
  if (idx === -1) throw new Error(`Invalid digit: ${ch}`);
  return idx;
}

// ================================================================
// 任意进制转换（2-64）
// ================================================================

export function convertBase(
  value: string,
  fromBase: number,
  toBase: number,
): ToolResult<string> {
  if (!value?.trim()) return fail('EMPTY_INPUT');
  if (fromBase < 2 || fromBase > 64) return fail('INVALID_FROM_BASE');
  if (toBase < 2 || toBase > 64) return fail('INVALID_TO_BASE');

  try {
    // Step 1: 处理符号
    let isNegative = false;
    let v = value.trim();
    if (v.startsWith('-')) {
      isNegative = true;
      v = v.substring(1);
    }

    // Step 2: fromBase 任意进制 → BigInt
    let num = 0n;
    for (const ch of v) {
      const digit = digitCharToValue(ch);
      if (digit >= fromBase) return fail('DIGIT_OUT_OF_RANGE');
      num = num * BigInt(fromBase) + BigInt(digit);
    }

    // Step 3: BigInt → toBase 任意进制
    if (num === 0n) return success('0');

    const digits: string[] = [];
    const toBaseBig = BigInt(toBase);
    while (num > 0n) {
      const remainder = Number(num % toBaseBig);
      digits.unshift(DIGIT_CHARS[remainder]);
      num = num / toBaseBig;
    }

    const result = digits.join('');
    return success(isNegative ? '-' + result : result);
  } catch {
    return fail('CONVERSION_ERROR');
  }
}

// ================================================================
// 快速四个进制转换（Bin / Oct / Dec / Hex）
// ================================================================

export function quickConvert(value: string, fromBase: 2 | 8 | 10 | 16): ToolResult<QuickConversion> {
  if (!value?.trim()) return fail('EMPTY_INPUT');

  try {
    let isNegative = false;
    let v = value.trim();
    if (v.startsWith('-')) {
      isNegative = true;
      v = v.substring(1);
    }

    // 移除前缀
    if (fromBase === 2) v = v.replace(/^0b/i, '');
    if (fromBase === 8) v = v.replace(/^0o/i, '');
    if (fromBase === 16) v = v.replace(/^0x/i, '');

    // 转为 BigInt
    let num = 0n;
    if (fromBase === 10) {
      num = BigInt((isNegative ? '-' : '') + v);
    } else {
      for (const ch of v) {
        const digit = digitCharToValue(ch);
        if (digit >= fromBase) return fail('DIGIT_OUT_OF_RANGE');
        num = num * BigInt(fromBase) + BigInt(digit);
      }
      if (isNegative) num = -num;
    }

    const format = (n: bigint, base: number, prefix: string): string => {
      if (n < 0n) {
        return '-' + prefix + (-n).toString(base).toUpperCase();
      }
      return prefix + n.toString(base).toUpperCase();
    };

    return success({
      bin: format(num, 2, '0b'),
      oct: format(num, 8, '0o'),
      dec: num.toString(),
      hex: format(num, 16, '0x'),
    });
  } catch {
    return fail('CONVERSION_ERROR');
  }
}

// ================================================================
// 文本 ↔ 二进制视图
// ================================================================

export function textToBinaryView(
  text: string,
  _viewType: 'hex' | 'binary' | 'both' = 'both',
): ToolResult<{ hex: string; binary: string }> {
  if (!text) return fail('EMPTY_INPUT');

  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);

  const hexParts: string[] = [];
  const binParts: string[] = [];

  for (const b of bytes) {
    hexParts.push(b.toString(16).padStart(2, '0').toUpperCase());
    binParts.push(b.toString(2).padStart(8, '0'));
  }

  const result: { hex: string; binary: string } = {
    hex: hexParts.join(' '),
    binary: binParts.join(' '),
  };

  return success(result);
}

// ================================================================
// 位运算
// ================================================================

export function bitwiseOp(
  a: string,
  b: string,
  op: BitOp,
  fromBase: number = 16,
): ToolResult<string> {
  if (!a?.trim()) return fail('EMPTY_A');
  if (op !== 'NOT' && !b?.trim()) return fail('EMPTY_B');
  if (fromBase < 2 || fromBase > 64) return fail('INVALID_FROM_BASE');

  try {
    const va = bigintFromString(a.trim(), fromBase);
    let vb: bigint | undefined;

    if (op !== 'NOT') {
      vb = bigintFromString(b.trim(), fromBase);
    }

    let result: bigint;
    switch (op) {
      case 'AND':
        result = va & vb!;
        break;
      case 'OR':
        result = va | vb!;
        break;
      case 'XOR':
        result = va ^ vb!;
        break;
      case 'NOT':
        // 按位取反：对当前值取反后处理有限的位宽
        // 以值的最小位宽度为限
        result = ~va;
        break;
      case 'LSHIFT':
        if (vb! < 0n) return fail('NEGATIVE_SHIFT');
        result = va << vb!;
        break;
      case 'RSHIFT':
        if (vb! < 0n) return fail('NEGATIVE_SHIFT');
        result = va >> vb!;
        break;
      default:
        return fail('INVALID_OP');
    }

    return success(toBaseString(result, 16));
  } catch {
    return fail('BITWISE_ERROR');
  }
}

// ================================================================
// 内部辅助函数
// ================================================================

function bigintFromString(s: string, base: number): bigint {
  let isNegative = false;
  let v = s;
  if (v.startsWith('-')) {
    isNegative = true;
    v = v.substring(1);
  }

  if (base === 10) {
    return BigInt((isNegative ? '-' : '') + v);
  }

  let result = 0n;
  for (const ch of v) {
    const digit = digitCharToValue(ch);
    result = result * BigInt(base) + BigInt(digit);
  }

  return isNegative ? -result : result;
}

function toBaseString(n: bigint, base: number): string {
  if (n === 0n) return '0';
  const isNegative = n < 0n;
  let num = isNegative ? -n : n;
  const digits: string[] = [];
  const baseBig = BigInt(base);

  while (num > 0n) {
    digits.unshift(DIGIT_CHARS[Number(num % baseBig)]);
    num = num / baseBig;
  }

  const result = digits.join('').toUpperCase();
  return isNegative ? '-' + result : result;
}
