// ============================================================
// 编解码模块 — 实现
// 由 .spec/encode-decode.spec.yaml 驱动
// ============================================================
import type { ToolResult, MultiLayerDecodeResult } from '../types';

// --- 工具：统一成功/失败结果构造 ---

function success<T>(data: T, metadata?: Record<string, string>): ToolResult<T> {
  return { success: true, data, error: null, metadata: metadata ?? null };
}

function fail(error: string): ToolResult<never> {
  return { success: false, data: undefined as never, error, metadata: null };
}

// ================================================================
// Base64
// ================================================================

export function base64Encode(text: string): ToolResult<string> {
  if (!text) return fail('EMPTY_INPUT');
  text = text.trim();
  if (!text) return fail('EMPTY_INPUT');

  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);

  // 使用 btoa 的 UTF-8 安全包装
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return success(btoa(binary));
}

export function base64Decode(text: string): ToolResult<string> {
  if (!text) return fail('EMPTY_INPUT');

  // 选区文本常带有前后空白/换行，需先清理
  text = text.trim();
  if (!text) return fail('EMPTY_INPUT');

  // 自动检测并处理 URL Safe 变体
  let normalized = text.replace(/-/g, '+').replace(/_/g, '/');

  // 自动修复 padding
  while (normalized.length % 4 !== 0) {
    normalized += '=';
  }

  try {
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const decoder = new TextDecoder();
    return success(decoder.decode(bytes));
  } catch {
    return fail('INVALID_BASE64');
  }
}

// ================================================================
// Base32 (RFC 4648)
// ================================================================

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BASE32_LOOKUP: Record<string, number> = {};
for (let i = 0; i < BASE32_ALPHABET.length; i++) {
  BASE32_LOOKUP[BASE32_ALPHABET[i]] = i;
  BASE32_LOOKUP[BASE32_ALPHABET[i].toLowerCase()] = i;
}

export function base32Encode(text: string): ToolResult<string> {
  if (!text) return fail('EMPTY_INPUT');

  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const bits: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    for (let j = 7; j >= 0; j--) {
      bits.push((bytes[i] >> j) & 1);
    }
  }

  // 补足到 5 的倍数
  while (bits.length % 5 !== 0) {
    bits.push(0);
  }

  let result = '';
  for (let i = 0; i < bits.length; i += 5) {
    const val =
      (bits[i] << 4) |
      (bits[i + 1] << 3) |
      (bits[i + 2] << 2) |
      (bits[i + 3] << 1) |
      bits[i + 4];
    result += BASE32_ALPHABET[val];
  }

  // Padding: 补齐到 8 的倍数
  const padLen = (8 - (result.length % 8)) % 8;
  result += '='.repeat(padLen);

  return success(result);
}

export function base32Decode(text: string): ToolResult<string> {
  if (!text) return fail('EMPTY_INPUT');

  const cleaned = text.replace(/=+$/, '').replace(/\s/g, '');

  const bits: number[] = [];
  for (const ch of cleaned) {
    const val = BASE32_LOOKUP[ch];
    if (val === undefined) return fail('INVALID_BASE32');
    for (let j = 4; j >= 0; j--) {
      bits.push((val >> j) & 1);
    }
  }

  // 按 8 位分组
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    const byte =
      (bits[i] << 7) |
      (bits[i + 1] << 6) |
      (bits[i + 2] << 5) |
      (bits[i + 3] << 4) |
      (bits[i + 4] << 3) |
      (bits[i + 5] << 2) |
      (bits[i + 6] << 1) |
      bits[i + 7];
    bytes.push(byte);
  }

  const decoder = new TextDecoder();
  return success(decoder.decode(new Uint8Array(bytes)));
}

// ================================================================
// Base16 / Hex
// ================================================================

export function hexEncode(text: string): ToolResult<string> {
  if (!text) return fail('EMPTY_INPUT');

  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  let result = '';
  for (const b of bytes) {
    result += b.toString(16).padStart(2, '0');
  }
  return success(result);
}

export function hexDecode(
  text: string,
  separator: string | null = null,
): ToolResult<string> {
  if (!text) return fail('EMPTY_INPUT');

  let cleaned = text;
  if (separator !== null) {
    cleaned = cleaned.split(separator).join('');
  }
  // 移除空格、换行、0x 前缀
  cleaned = cleaned.replace(/[\s\n\r]/g, '').replace(/^0x/i, '');

  if (!/^[0-9a-fA-F]*$/.test(cleaned) || cleaned.length % 2 !== 0) {
    return fail('INVALID_HEX');
  }

  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes[i / 2] = parseInt(cleaned.substring(i, i + 2), 16);
  }

  const decoder = new TextDecoder();
  return success(decoder.decode(bytes));
}

// ================================================================
// URL Encode/Decode
// ================================================================

export function urlEncode(text: string): ToolResult<string> {
  if (!text) return fail('EMPTY_INPUT');
  return success(encodeURIComponent(text));
}

export function urlDecode(text: string): ToolResult<string> {
  if (!text) return fail('EMPTY_INPUT');
  try {
    return success(decodeURIComponent(text));
  } catch {
    return fail('INVALID_URI');
  }
}

// ================================================================
// Unicode Escape
// ================================================================

export function unicodeEscapeEncode(text: string): ToolResult<string> {
  if (!text) return fail('EMPTY_INPUT');

  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 127) {
      result += '\\u' + code.toString(16).padStart(4, '0');
    } else {
      result += text[i];
    }
  }
  return success(result);
}

export function unicodeEscapeDecode(text: string): ToolResult<string> {
  if (!text) return fail('EMPTY_INPUT');

  let result = text;

  // 解码 \uXXXX (4 位十六进制)
  result = result.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );

  // 解码 \UXXXXXXXX (8 位十六进制)
  result = result.replace(/\\U([0-9a-fA-F]{8})/g, (_, hex) => {
    const cp = parseInt(hex, 16);
    if (cp <= 0xffff) return String.fromCharCode(cp);
    // surrogate pair
    const high = ((cp - 0x10000) >> 10) + 0xd800;
    const low = ((cp - 0x10000) & 0x3ff) + 0xdc00;
    return String.fromCharCode(high, low);
  });

  // 解码 \xXX (2 位十六进制)
  result = result.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );

  // 解码 %uXXXX
  result = result.replace(/%u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );

  return success(result);
}

// ================================================================
// HTML Entity
// ================================================================

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

export function htmlEntityEncode(text: string): ToolResult<string> {
  if (!text) return fail('EMPTY_INPUT');

  let result = '';
  for (const ch of text) {
    result += HTML_ENTITIES[ch] ?? ch;
  }
  return success(result);
}

export function htmlEntityDecode(text: string): ToolResult<string> {
  if (!text) return fail('EMPTY_INPUT');

  // 使用 DOMParser 安全解码 HTML 实体
  // 在 Chrome Extension 中可用
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const decoded = doc.documentElement.textContent ?? '';

  // 额外处理十进制和十六进制实体（DOMParser 已处理，但确保覆盖）
  return success(decoded);
}

// ================================================================
// JWT Decode
// ================================================================

export interface JwtPayload {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signatureRaw: string;
}

export function jwtDecode(
  token: string,
): ToolResult<JwtPayload> {
  if (!token) return fail('EMPTY_INPUT');

  const parts = token.split('.');
  if (parts.length !== 3) return fail('NOT_JWT_FORMAT');

  try {
    const headerJson = urlSafeBase64DecodeToString(parts[0]);
    const payloadJson = urlSafeBase64DecodeToString(parts[1]);

    return success({
      header: JSON.parse(headerJson) as Record<string, unknown>,
      payload: JSON.parse(payloadJson) as Record<string, unknown>,
      signatureRaw: parts[2],
    });
  } catch {
    return fail('NOT_JWT_FORMAT');
  }
}

function urlSafeBase64DecodeToString(base64url: string): string {
  // 标准化为 standard base64
  let normalized = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4 !== 0) normalized += '=';
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

// ================================================================
// 多层解码引擎
// ================================================================

interface DetectionRule {
  name: string;
  test: (text: string) => boolean;
  decode: (text: string) => string;
}

const DETECTION_RULES: DetectionRule[] = [
  {
    name: 'base64',
    test: (text: string) =>
      /^[A-Za-z0-9+/=_-]+$/.test(text) &&
      text.length >= 4 &&
      /[A-Za-z]/.test(text), // 至少含一个字母
    decode: (text: string) => {
      // 使用 base64Decode 逻辑
      let normalized = text.replace(/-/g, '+').replace(/_/g, '/');
      while (normalized.length % 4 !== 0) normalized += '=';
      try {
        const binary = atob(normalized);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return new TextDecoder().decode(bytes);
      } catch {
        throw new Error('base64 decode failed');
      }
    },
  },
  {
    name: 'url_encoded',
    test: (text: string) => /%[0-9a-fA-F]{2}/.test(text),
    decode: (text: string) => decodeURIComponent(text),
  },
  {
    name: 'hex',
    test: (text: string) =>
      /^[0-9a-fA-F]+$/.test(text) &&
      text.length >= 2 &&
      text.length % 2 === 0,
    decode: (text: string) => {
      const bytes = new Uint8Array(text.length / 2);
      for (let i = 0; i < text.length; i += 2) {
        bytes[i / 2] = parseInt(text.substring(i, i + 2), 16);
      }
      return new TextDecoder().decode(bytes);
    },
  },
  {
    name: 'unicode_escape',
    test: (text: string) => /\\[uxU]/.test(text),
    decode: (text: string) => {
      // 使用 unicodeEscapeDecode
      let r = text;
      r = r.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) =>
        String.fromCharCode(parseInt(h, 16)),
      );
      r = r.replace(/\\U([0-9a-fA-F]{8})/g, (_, h) => {
        const cp = parseInt(h, 16);
        return cp <= 0xffff
          ? String.fromCharCode(cp)
          : String.fromCharCode(
              ((cp - 0x10000) >> 10) + 0xd800,
              ((cp - 0x10000) & 0x3ff) + 0xdc00,
            );
      });
      r = r.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) =>
        String.fromCharCode(parseInt(h, 16)),
      );
      return r;
    },
  },
  {
    name: 'html_entity',
    test: (text: string) => /&#\d+;|&#x[0-9a-fA-F]+;|&[a-z]+;/.test(text),
    decode: (text: string) =>
      new DOMParser().parseFromString(text, 'text/html').documentElement
        .textContent ?? text,
  },
];

export function multiLayerDecode(
  text: string,
  maxDepth: number = 10,
): ToolResult<MultiLayerDecodeResult> {
  if (!text) return fail('EMPTY_INPUT');

  const layers: MultiLayerDecodeResult['layers'] = [];
  let current = text;

  for (let depth = 0; depth < maxDepth; depth++) {
    let decoded = false;

    for (const rule of DETECTION_RULES) {
      if (rule.test(current)) {
        try {
          const result = rule.decode(current);
          if (result !== current) {
            layers.push({
              layer: layers.length + 1,
              detected: rule.name,
              result,
            });
            current = result;
            decoded = true;
            break; // 每层只解码一种格式
          }
        } catch {
          // 检测到但解码失败，跳过该规则
          continue;
        }
      }
    }

    if (!decoded) break;
  }

  if (layers.length === 0) {
    return success({ layers });
  }

  if (layers.length >= maxDepth) {
    return {
      success: false,
      data: { layers },
      error: 'MAX_DEPTH_EXCEEDED',
      metadata: null,
    };
  }

  return success({ layers });
}
