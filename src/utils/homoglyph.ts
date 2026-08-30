// ============================================================
// 同形异义字 / 混淆字符检测模块 — 实现
// ============================================================
import type { ToolResult } from '../types';

function success<T>(data: T, metadata?: Record<string, string>): ToolResult<T> {
  return { success: true, data, error: null, metadata: metadata ?? null };
}

function fail(error: string): ToolResult<never> {
  return { success: false, data: undefined as never, error, metadata: null };
}

// ================================================================
// 类型定义
// ================================================================

export type ScriptCategory =
  | 'Latin'
  | 'Cyrillic'
  | 'Greek'
  | 'Arabic'
  | 'Hebrew'
  | 'CJK'
  | 'Devanagari'
  | 'Hangul'
  | 'Thai'
  | 'Armenian'
  | 'Georgian'
  | 'Common'
  | 'Inherited'
  | 'Unknown';

export type ConfusionSeverity = 'critical' | 'warning' | 'info';

export interface CharScriptInfo {
  char: string;
  codePoint: number;
  hex: string;
  script: ScriptCategory;
  name?: string;
}

export interface ScriptMixInfo {
  dominantScript: ScriptCategory;
  scriptsUsed: Record<ScriptCategory, number>;
  mixed: boolean;
  suspiciousMix: boolean;
}

export interface InvisibleCharIssue {
  char: string;
  codePoint: number;
  hex: string;
  index: number;
  category: InvisibleCharCategory;
  description: string;
}

export type InvisibleCharCategory =
  | 'ZERO_WIDTH'
  | 'BIDI'
  | 'CONTROL'
  | 'FORMAT'
  | 'WHITESPACE_OTHER'
  | 'TAG'
  | 'VARIATION_SELECTOR';

export interface HomoglyphMatch {
  char: string;
  codePoint: number;
  hex: string;
  index: number;
  lookalike: string;
  lookalikeScript: ScriptCategory;
  originalScript: ScriptCategory;
  description: string;
}

export interface HomoglyphAnalysisResult {
  normalized: string;
  hasIssue: boolean;
  severity: ConfusionSeverity;
  scriptMix: ScriptMixInfo;
  invisibleChars: InvisibleCharIssue[];
  homoglyphs: HomoglyphMatch[];
  punycodeDecoded: string | null;
  isPunycode: boolean;
  allCharInfo: CharScriptInfo[];
  summary: string[];
}

export interface PunycodeDecodeResult {
  decoded: string;
  original: string;
  isPunycode: boolean;
  labels: { label: string; decoded: string; isPunycode: boolean }[];
}

// ================================================================
// Punycode 纯 JS 实现 (RFC 3492)
// ================================================================

const BASE = 36;
const TMIN = 1;
const TMAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 0x80;
const DELIMITER = '-';
const PUNYCODE_PREFIX = 'xn--';

function adaptBias(delta: number, numpoints: number, firsttime: boolean): number {
  delta = firsttime ? Math.floor(delta / DAMP) : delta >> 1;
  delta += Math.floor(delta / numpoints);
  let k = 0;
  while (delta > ((BASE - TMIN) * TMAX) >> 1) {
    delta = Math.floor(delta / (BASE - TMIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - TMIN + 1) * delta) / (delta + SKEW));
}

function digitToCodePoint(digit: number): number {
  return digit + 22 + 75 * (digit < 26 ? 1 : 0);
}

function codePointToDigit(cp: number): number {
  return cp - 48 < 10 ? cp - 22 : cp - 65 < 26 ? cp - 65 : cp - 97 < 26 ? cp - 97 : BASE;
}

function punycodeDecodeImpl(input: string): string {
  const n = INITIAL_N;
  const i = 0;
  const bias = INITIAL_BIAS;
  const output: number[] = [];

  let d = 0;
  const delimIndex = input.lastIndexOf(DELIMITER);
  if (delimIndex !== -1) {
    for (let j = 0; j < delimIndex; j++) {
      const cp = input.charCodeAt(j);
      if (cp >= 0x80) throw new Error('INVALID_PUNYCODE');
      output.push(cp);
    }
    d = delimIndex + 1;
  }

  const inputLen = input.length;
  let currentN = n;
  let currentI = i;
  let currentBias = bias;

  while (d < inputLen) {
    const oldI = currentI;
    let w = 1;
    let k: number;
    for (k = BASE; ; k += BASE) {
      if (d >= inputLen) throw new Error('INVALID_PUNYCODE');
      const digit = codePointToDigit(input.charCodeAt(d++));
      if (digit >= BASE) throw new Error('INVALID_PUNYCODE');
      currentI += digit * w;
      const t =
        k <= currentBias
          ? TMIN
          : k >= currentBias + TMAX
          ? TMAX
          : k - currentBias;
      if (digit < t) break;
      w *= BASE - t;
    }
    const outLen = output.length + 1;
    currentBias = adaptBias(currentI - oldI, outLen, oldI === 0);
    if (Math.floor(currentI / outLen) > 0x10ffff - currentN) {
      throw new Error('INVALID_PUNYCODE_OVERFLOW');
    }
    currentN += Math.floor(currentI / outLen);
    currentI %= outLen;
    if (currentN < 0 || currentN > 0x10ffff) throw new Error('INVALID_PUNYCODE_CP');
    output.splice(currentI, 0, currentN);
    currentI++;
  }

  return String.fromCodePoint(...output);
}

void digitToCodePoint;

// ================================================================
// Punycode 域名解码
// ================================================================

export function punycodeDecodeDomain(domain: string): ToolResult<PunycodeDecodeResult> {
  if (!domain) return fail('EMPTY_INPUT');
  const trimmed = domain.trim();
  if (!trimmed) return fail('EMPTY_INPUT');

  const labels = trimmed.split('.');
  const decodedLabels: PunycodeDecodeResult['labels'] = [];
  let anyPunycode = false;

  for (const label of labels) {
    const lowerLabel = label.toLowerCase();
    if (lowerLabel.startsWith(PUNYCODE_PREFIX)) {
      try {
        const encodedPart = lowerLabel.substring(PUNYCODE_PREFIX.length);
        const decodedLabel = punycodeDecodeImpl(encodedPart);
        decodedLabels.push({
          label,
          decoded: decodedLabel,
          isPunycode: true,
        });
        anyPunycode = true;
      } catch (e) {
        decodedLabels.push({
          label,
          decoded: label,
          isPunycode: false,
        });
      }
    } else {
      decodedLabels.push({
        label,
        decoded: label,
        isPunycode: false,
      });
    }
  }

  const decodedDomain = decodedLabels.map((l) => l.decoded).join('.');

  const metadata: Record<string, string> = {};
  if (anyPunycode) metadata.punycodeLabels = String(decodedLabels.filter((l) => l.isPunycode).length);

  return success(
    {
      decoded: decodedDomain,
      original: trimmed,
      isPunycode: anyPunycode,
      labels: decodedLabels,
    },
    Object.keys(metadata).length > 0 ? metadata : undefined,
  );
}

// ================================================================
// Unicode 脚本判断
// ================================================================

function detectScript(codePoint: number): ScriptCategory {
  if (
    (codePoint >= 0x0041 && codePoint <= 0x005a) ||
    (codePoint >= 0x0061 && codePoint <= 0x007a) ||
    (codePoint >= 0x00c0 && codePoint <= 0x00ff) ||
    (codePoint >= 0x0100 && codePoint <= 0x017f) ||
    (codePoint >= 0x0180 && codePoint <= 0x024f) ||
    (codePoint >= 0x1e00 && codePoint <= 0x1eff) ||
    (codePoint >= 0x2c60 && codePoint <= 0x2c7f) ||
    (codePoint >= 0xa720 && codePoint <= 0xa7ff)
  ) {
    return 'Latin';
  }

  if (
    (codePoint >= 0x0400 && codePoint <= 0x04ff) ||
    (codePoint >= 0x0500 && codePoint <= 0x052f) ||
    (codePoint >= 0x2de0 && codePoint <= 0x2dff) ||
    (codePoint >= 0xa640 && codePoint <= 0xa69f) ||
    (codePoint >= 0x1c80 && codePoint <= 0x1c8f)
  ) {
    return 'Cyrillic';
  }

  if (
    (codePoint >= 0x0370 && codePoint <= 0x03ff) ||
    (codePoint >= 0x1f00 && codePoint <= 0x1fff)
  ) {
    return 'Greek';
  }

  if (
    (codePoint >= 0x0600 && codePoint <= 0x06ff) ||
    (codePoint >= 0x0750 && codePoint <= 0x077f) ||
    (codePoint >= 0x08a0 && codePoint <= 0x08ff) ||
    (codePoint >= 0xfb50 && codePoint <= 0xfdff) ||
    (codePoint >= 0xfe70 && codePoint <= 0xfeff) ||
    (codePoint >= 0x10e60 && codePoint <= 0x10e7f) ||
    (codePoint >= 0x1ec70 && codePoint <= 0x1ecbf) ||
    (codePoint >= 0x1ed00 && codePoint <= 0x1ed4f)
  ) {
    return 'Arabic';
  }

  if (codePoint >= 0x0590 && codePoint <= 0x05ff) {
    return 'Hebrew';
  }

  if (
    (codePoint >= 0x3040 && codePoint <= 0x309f) ||
    (codePoint >= 0x30a0 && codePoint <= 0x30ff) ||
    (codePoint >= 0x31f0 && codePoint <= 0x31ff) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xff66 && codePoint <= 0xff9d) ||
    (codePoint >= 0xff00 && codePoint <= 0xffef) ||
    (codePoint >= 0x2e80 && codePoint <= 0x2eff) ||
    (codePoint >= 0x2f00 && codePoint <= 0x2fdf) ||
    (codePoint >= 0x3000 && codePoint <= 0x303f) ||
    (codePoint >= 0x3200 && codePoint <= 0x32ff) ||
    (codePoint >= 0x3300 && codePoint <= 0x33ff) ||
    (codePoint >= 0x20000 && codePoint <= 0x2a6df)
  ) {
    return 'CJK';
  }

  if (codePoint >= 0x0900 && codePoint <= 0x097f) {
    return 'Devanagari';
  }

  if (
    (codePoint >= 0xac00 && codePoint <= 0xd7af) ||
    (codePoint >= 0x1100 && codePoint <= 0x11ff) ||
    (codePoint >= 0x3130 && codePoint <= 0x318f)
  ) {
    return 'Hangul';
  }

  if (codePoint >= 0x0e00 && codePoint <= 0x0e7f) {
    return 'Thai';
  }

  if (codePoint >= 0x0530 && codePoint <= 0x058f) {
    return 'Armenian';
  }

  if (codePoint >= 0x10a0 && codePoint <= 0x10ff) {
    return 'Georgian';
  }

  if (
    (codePoint >= 0x0000 && codePoint <= 0x001f) ||
    (codePoint >= 0x0020 && codePoint <= 0x002f) ||
    (codePoint >= 0x003a && codePoint <= 0x0040) ||
    (codePoint >= 0x005b && codePoint <= 0x0060) ||
    (codePoint >= 0x007b && codePoint <= 0x007f) ||
    (codePoint >= 0x0080 && codePoint <= 0x009f) ||
    (codePoint >= 0x2000 && codePoint <= 0x206f) ||
    (codePoint >= 0x20a0 && codePoint <= 0x20cf) ||
    (codePoint >= 0x2100 && codePoint <= 0x214f) ||
    (codePoint >= 0x2190 && codePoint <= 0x21ff) ||
    (codePoint >= 0x2200 && codePoint <= 0x22ff) ||
    (codePoint >= 0x2300 && codePoint <= 0x23ff) ||
    (codePoint >= 0x2500 && codePoint <= 0x257f) ||
    (codePoint >= 0x2580 && codePoint <= 0x259f) ||
    (codePoint >= 0x25a0 && codePoint <= 0x25ff) ||
    (codePoint >= 0x2600 && codePoint <= 0x26ff) ||
    (codePoint >= 0x2700 && codePoint <= 0x27bf) ||
    (codePoint >= 0x27c0 && codePoint <= 0x27ef) ||
    (codePoint >= 0xfe50 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe4f) ||
    (codePoint >= 0xff00 && codePoint <= 0xffef && !(codePoint >= 0xff66 && codePoint <= 0xff9d))
  ) {
    return 'Common';
  }

  if (codePoint === 0x00ad || (codePoint >= 0x0300 && codePoint <= 0x036f) || codePoint === 0xfe0f || codePoint === 0xfe0e) {
    return 'Inherited';
  }

  return 'Unknown';
}

// ================================================================
// 不可见/混淆字符检测
// ================================================================

const INVISIBLE_CHAR_RANGES: Array<{
  start: number;
  end: number;
  category: InvisibleCharCategory;
  description: string;
}> = [
  { start: 0x200b, end: 0x200f, category: 'ZERO_WIDTH', description: '零宽字符（ZWSP/ZWNJ/ZWJ/LRM/RLM）' },
  { start: 0x202a, end: 0x202e, category: 'BIDI', description: 'BIDI 控制字符（LRE/RLE/PDF/LRO/RLO）' },
  { start: 0x2066, end: 0x2069, category: 'BIDI', description: 'BIDI 隔离字符（LRI/RLI/FSI/PDI）' },
  { start: 0x0000, end: 0x0008, category: 'CONTROL', description: 'C0 控制字符' },
  { start: 0x000e, end: 0x001f, category: 'CONTROL', description: 'C0 控制字符' },
  { start: 0x007f, end: 0x007f, category: 'CONTROL', description: 'DEL 控制字符' },
  { start: 0x0080, end: 0x009f, category: 'CONTROL', description: 'C1 控制字符' },
  { start: 0x061c, end: 0x061c, category: 'BIDI', description: '阿拉伯字母标记（ALM）' },
  { start: 0x00ad, end: 0x00ad, category: 'FORMAT', description: '软连字符（SHY）' },
  { start: 0x2060, end: 0x2064, category: 'FORMAT', description: '不可见格式字符（WJ/⁡/⁢/⁣/⁤）' },
  { start: 0x206a, end: 0x206f, category: 'FORMAT', description: '抑制格式字符' },
  { start: 0xfeff, end: 0xfeff, category: 'FORMAT', description: 'BOM / ZWNBSP（可能导致解析异常）' },
  { start: 0xfff9, end: 0xfffb, category: 'FORMAT', description: '行间/线性/对象占位符' },
  { start: 0x1d173, end: 0x1d17a, category: 'FORMAT', description: '音乐记谱控制字符' },
  { start: 0xe0000, end: 0xe007f, category: 'TAG', description: '标签字符（废弃 Unicode 特性）' },
  { start: 0xe0100, end: 0xe01ef, category: 'VARIATION_SELECTOR', description: '变体选择器补充区' },
  { start: 0xfe00, end: 0xfe0f, category: 'VARIATION_SELECTOR', description: '变体选择符（emoji 表情控制等）' },
];

function detectInvisibleChar(codePoint: number): {
  category: InvisibleCharCategory;
  description: string;
} | null {
  for (const range of INVISIBLE_CHAR_RANGES) {
    if (codePoint >= range.start && codePoint <= range.end) {
      return { category: range.category, description: range.description };
    }
  }

  if (codePoint === 0x0009 || codePoint === 0x000a || codePoint === 0x000d) {
    return null;
  }
  if (codePoint >= 0x2000 && codePoint <= 0x200a) {
    return { category: 'WHITESPACE_OTHER', description: '非常规空白字符（EN QUAD 等）' };
  }
  if (codePoint === 0x00a0) {
    return { category: 'WHITESPACE_OTHER', description: '不间断空格 (NBSP)' };
  }
  if (codePoint === 0x2028) {
    return { category: 'WHITESPACE_OTHER', description: '行分隔符 (LS)' };
  }
  if (codePoint === 0x2029) {
    return { category: 'WHITESPACE_OTHER', description: '段落分隔符 (PS)' };
  }
  if (codePoint === 0x202f) {
    return { category: 'WHITESPACE_OTHER', description: '窄不间断空格 (NNBSP)' };
  }
  if (codePoint === 0x205f) {
    return { category: 'WHITESPACE_OTHER', description: '中等数学空格 (MMSP)' };
  }
  if (codePoint === 0x3000) {
    return { category: 'WHITESPACE_OTHER', description: '全角空格 (IDEOGRAPHIC SPACE)' };
  }

  return null;
}

// ================================================================
// 同形异义字映射表（高风险常见组合）
// ================================================================

interface HomoglyphEntry {
  codepoint: number;
  lookalike: string;
  description: string;
}

const HOMOGLYPH_MAP: Record<string, HomoglyphEntry[]> = {
  a: [
    { codepoint: 0x0430, lookalike: '西里尔小写 а (U+0430)', description: '西里尔 а → 拉丁 a' },
    { codepoint: 0x03b1, lookalike: '希腊小写 α (U+03B1)', description: '希腊 α → 拉丁 a' },
  ],
  A: [
    { codepoint: 0x0410, lookalike: '西里尔大写 А (U+0410)', description: '西里尔 А → 拉丁 A' },
    { codepoint: 0x0391, lookalike: '希腊大写 Α (U+0391)', description: '希腊 Α → 拉丁 A' },
  ],
  b: [
    { codepoint: 0x042c, lookalike: '西里尔 Ь (U+042C)', description: '西里尔 Ь → 拉丁 b' },
  ],
  B: [
    { codepoint: 0x0412, lookalike: '西里尔 В (U+0412)', description: '西里尔 В → 拉丁 B' },
    { codepoint: 0x0392, lookalike: '希腊 Β (U+0392)', description: '希腊 Β → 拉丁 B' },
  ],
  c: [
    { codepoint: 0x0441, lookalike: '西里尔 с (U+0441)', description: '西里尔 с → 拉丁 c' },
    { codepoint: 0x03f2, lookalike: '希腊 lunate sigma ϲ (U+03F2)', description: '希腊 ϲ → 拉丁 c' },
  ],
  C: [
    { codepoint: 0x0421, lookalike: '西里尔 С (U+0421)', description: '西里尔 С → 拉丁 C' },
    { codepoint: 0x039a, lookalike: '希腊 Κ (U+039A)', description: '希腊 Κ → 拉丁 C 近似' },
  ],
  d: [
    { codepoint: 0x0501, lookalike: '西里尔 ԁ (U+0501)', description: '西里尔 ԁ → 拉丁 d' },
  ],
  D: [
    { codepoint: 0x0414, lookalike: '西里尔 Д (U+0414)', description: '西里尔 Д → 拉丁 D 近似' },
  ],
  e: [
    { codepoint: 0x0435, lookalike: '西里尔 е (U+0435)', description: '西里尔 е → 拉丁 e' },
    { codepoint: 0x0451, lookalike: '西里尔 ё (U+0451)', description: '西里尔 ё → 拉丁 e/ë' },
    { codepoint: 0x03b5, lookalike: '希腊 ε (U+03B5)', description: '希腊 ε → 拉丁 e 近似' },
  ],
  E: [
    { codepoint: 0x0415, lookalike: '西里尔 Е (U+0415)', description: '西里尔 Е → 拉丁 E' },
    { codepoint: 0x0401, lookalike: '西里尔 Ё (U+0401)', description: '西里尔 Ё → 拉丁 E/Ë' },
    { codepoint: 0x0395, lookalike: '希腊 Ε (U+0395)', description: '希腊 Ε → 拉丁 E' },
  ],
  f: [
    { codepoint: 0x0493, lookalike: '西里尔 ғ (U+0493)', description: '西里尔 ғ → 拉丁 f' },
  ],
  g: [
    { codepoint: 0x0261, lookalike: '拉丁 ɡ (U+0261)', description: '拉丁小字母 g → 视觉近似' },
    { codepoint: 0x03b3, lookalike: '希腊 γ (U+03B3)', description: '希腊 γ → 拉丁 g 近似' },
  ],
  h: [
    { codepoint: 0x04bb, lookalike: '西里尔 һ (U+04BB)', description: '西里尔 һ → 拉丁 h' },
    { codepoint: 0x03b7, lookalike: '希腊 η (U+03B7)', description: '希腊 η → 拉丁 h 近似' },
  ],
  H: [
    { codepoint: 0x041d, lookalike: '西里尔 Н (U+041D)', description: '西里尔 Н → 拉丁 H' },
    { codepoint: 0x0397, lookalike: '希腊 Η (U+0397)', description: '希腊 Η → 拉丁 H' },
    { codepoint: 0x042a, lookalike: '西里尔 Ъ (U+042A)', description: '西里尔 Ъ → 拉丁 H 近似' },
  ],
  i: [
    { codepoint: 0x0456, lookalike: '西里尔 і (U+0456)', description: '西里尔 і → 拉丁 i' },
    { codepoint: 0x03b9, lookalike: '希腊 ι (U+03B9)', description: '希腊 ι → 拉丁 i' },
    { codepoint: 0x0131, lookalike: '拉丁 ı (U+0131)', description: '无点 i → 拉丁 i 近似' },
  ],
  I: [
    { codepoint: 0x0406, lookalike: '西里尔 І (U+0406)', description: '西里尔 І → 拉丁 I' },
    { codepoint: 0x0399, lookalike: '希腊 Ι (U+0399)', description: '希腊 Ι → 拉丁 I' },
  ],
  j: [
    { codepoint: 0x0458, lookalike: '西里尔 ј (U+0458)', description: '西里尔 ј → 拉丁 j' },
    { codepoint: 0x03f3, lookalike: '希腊 ϳ (U+03F3)', description: '希腊 ϳ → 拉丁 j' },
  ],
  J: [
    { codepoint: 0x0408, lookalike: '西里尔 Ј (U+0408)', description: '西里尔 Ј → 拉丁 J' },
  ],
  k: [
    { codepoint: 0x043a, lookalike: '西里尔 к (U+043A)', description: '西里尔 к → 拉丁 k 近似' },
  ],
  K: [
    { codepoint: 0x041a, lookalike: '西里尔 К (U+041A)', description: '西里尔 К → 拉丁 K' },
    { codepoint: 0x039a, lookalike: '希腊 Κ (U+039A)', description: '希腊 Κ → 拉丁 K' },
  ],
  l: [
    { codepoint: 0x04cf, lookalike: '西里尔 ӏ (U+04CF)', description: '西里尔 ӏ → 拉丁 l' },
  ],
  m: [
    { codepoint: 0x0442, lookalike: '西里尔 т (U+0442)', description: '西里尔 т → 拉丁 m 近似' },
  ],
  M: [
    { codepoint: 0x041c, lookalike: '西里尔 М (U+041C)', description: '西里尔 М → 拉丁 M' },
    { codepoint: 0x039c, lookalike: '希腊 Μ (U+039C)', description: '希腊 Μ → 拉丁 M' },
  ],
  n: [
    { codepoint: 0x043f, lookalike: '西里尔 п (U+043F)', description: '西里尔 п → 拉丁 n 近似' },
  ],
  N: [
    { codepoint: 0x041d, lookalike: '西里尔 Ӈ (U+04C7)', description: '西里尔近似 N' },
  ],
  o: [
    { codepoint: 0x043e, lookalike: '西里尔 о (U+043E)', description: '西里尔 о → 拉丁 o' },
    { codepoint: 0x03bf, lookalike: '希腊 ο (U+03BF)', description: '希腊 ο → 拉丁 o' },
    { codepoint: 0x03c9, lookalike: '希腊 ω (U+03C9)', description: '希腊 ω → 拉丁 o 近似' },
    { codepoint: 0x0585, lookalike: '亚美尼亚 օ (U+0585)', description: '亚美尼亚 օ → 拉丁 o' },
  ],
  O: [
    { codepoint: 0x041e, lookalike: '西里尔 О (U+041E)', description: '西里尔 О → 拉丁 O' },
    { codepoint: 0x039f, lookalike: '希腊 Ο (U+039F)', description: '希腊 Ο → 拉丁 O' },
    { codepoint: 0x03a9, lookalike: '希腊 Ω (U+03A9)', description: '希腊 Ω → 拉丁 O 近似' },
    { codepoint: 0x0555, lookalike: '亚美尼亚 Օ (U+0555)', description: '亚美尼亚 Օ → 拉丁 O' },
    { codepoint: 0x3007, lookalike: 'CJK 〇 (U+3007)', description: '汉字数字零 → 拉丁 O' },
  ],
  p: [
    { codepoint: 0x0440, lookalike: '西里尔 р (U+0440)', description: '西里尔 р → 拉丁 p' },
    { codepoint: 0x03c1, lookalike: '希腊 ρ (U+03C1)', description: '希腊 ρ → 拉丁 p' },
  ],
  P: [
    { codepoint: 0x0420, lookalike: '西里尔 Р (U+0420)', description: '西里尔 Р → 拉丁 P' },
    { codepoint: 0x03a1, lookalike: '希腊 Ρ (U+03A1)', description: '希腊 Ρ → 拉丁 P' },
  ],
  q: [
    { codepoint: 0x051b, lookalike: '西里尔 ҝ (U+051B)', description: '西里尔 ҝ → 拉丁 q 近似' },
  ],
  r: [
    { codepoint: 0x0433, lookalike: '西里尔 г (U+0433)', description: '西里尔 г → 拉丁 r 近似' },
  ],
  R: [
    { codepoint: 0x042f, lookalike: '西里尔 Я (U+042F)', description: '西里尔 Я → 拉丁 R 近似' },
  ],
  s: [
    { codepoint: 0x0455, lookalike: '西里尔 ѕ (U+0455)', description: '西里尔 ѕ → 拉丁 s 近似' },
  ],
  S: [
    { codepoint: 0x0405, lookalike: '西里尔 Ѕ (U+0405)', description: '西里尔 Ѕ → 拉丁 S 近似' },
  ],
  t: [
    { codepoint: 0x0442, lookalike: '西里尔 т (U+0442)', description: '西里尔 т → 拉丁 t 近似' },
  ],
  T: [
    { codepoint: 0x0422, lookalike: '西里尔 Т (U+0422)', description: '西里尔 Т → 拉丁 T' },
    { codepoint: 0x03a4, lookalike: '希腊 Τ (U+03A4)', description: '希腊 Τ → 拉丁 T' },
  ],
  u: [
    { codepoint: 0x0438, lookalike: '西里尔 и (U+0438)', description: '西里尔 и → 拉丁 u 近似' },
  ],
  U: [
    { codepoint: 0x0426, lookalike: '西里尔 Ц (U+0426)', description: '西里尔 Ц → 拉丁 U 近似' },
  ],
  v: [
    { codepoint: 0x03bd, lookalike: '希腊 ν (U+03BD)', description: '希腊 ν → 拉丁 v 近似' },
  ],
  V: [
    { codepoint: 0x0412, lookalike: '西里尔 Ѵ (U+0472)', description: '西里尔近似 V' },
    { codepoint: 0x039d, lookalike: '希腊 Ν (U+039D)', description: '希腊 Ν → 拉丁 V 近似' },
  ],
  w: [
    { codepoint: 0x0448, lookalike: '西里尔 ш (U+0448)', description: '西里尔 ш → 拉丁 w 近似' },
    { codepoint: 0x03c9, lookalike: '希腊 ω (U+03C9)', description: '希腊 ω → 拉丁 w 近似' },
  ],
  W: [
    { codepoint: 0x0428, lookalike: '西里尔 Ш (U+0428)', description: '西里尔 Ш → 拉丁 W 近似' },
    { codepoint: 0x03a9, lookalike: '希腊 Ω (U+03A9)', description: '希腊 Ω → 拉丁 W 近似' },
  ],
  x: [
    { codepoint: 0x0445, lookalike: '西里尔 х (U+0445)', description: '西里尔 х → 拉丁 x' },
    { codepoint: 0x03c7, lookalike: '希腊 χ (U+03C7)', description: '希腊 χ → 拉丁 x' },
  ],
  X: [
    { codepoint: 0x0425, lookalike: '西里尔 Х (U+0425)', description: '西里尔 Х → 拉丁 X' },
    { codepoint: 0x03a7, lookalike: '希腊 Χ (U+03A7)', description: '希腊 Χ → 拉丁 X' },
  ],
  y: [
    { codepoint: 0x0443, lookalike: '西里尔 у (U+0443)', description: '西里尔 у → 拉丁 y' },
    { codepoint: 0x03b3, lookalike: '希腊 γ (U+03B3)', description: '希腊 γ → 拉丁 y 近似' },
  ],
  Y: [
    { codepoint: 0x0423, lookalike: '西里尔 У (U+0423)', description: '西里尔 У → 拉丁 Y' },
    { codepoint: 0x03a5, lookalike: '希腊 Υ (U+03A5)', description: '希腊 Υ → 拉丁 Y' },
  ],
  z: [
    { codepoint: 0x0437, lookalike: '西里尔 з (U+0437)', description: '西里尔 з → 拉丁 z 近似' },
  ],
  '0': [
    { codepoint: 0x043e, lookalike: '西里尔 о (U+043E)', description: '西里尔 о → 数字 0' },
    { codepoint: 0x03bf, lookalike: '希腊 ο (U+03BF)', description: '希腊 ο → 数字 0' },
    { codepoint: 0x2d5a, lookalike: '乔治亚 ႚ (U+2D5A)', description: '乔治亚 → 数字 0' },
  ],
  '1': [
    { codepoint: 0x0456, lookalike: '西里尔 і (U+0456)', description: '西里尔 і → 数字 1' },
    { codepoint: 0x04cf, lookalike: '西里尔 ӏ (U+04CF)', description: '西里尔 ӏ → 数字 1' },
    { codepoint: 0x0131, lookalike: '拉丁 ı (U+0131)', description: '无点 i → 数字 1' },
  ],
  '3': [
    { codepoint: 0x0417, lookalike: '西里尔 З (U+0417)', description: '西里尔 З → 数字 3' },
  ],
  '4': [
    { codepoint: 0x044b, lookalike: '西里尔 ы (U+044B)', description: '西里尔 ы → 数字 4 近似' },
  ],
  '5': [
    { codepoint: 0x0455, lookalike: '西里尔 ѕ (U+0455)', description: '西里尔 ѕ → 数字 5 近似' },
  ],
  '6': [
    { codepoint: 0x0431, lookalike: '西里尔 б (U+0431)', description: '西里尔 б → 数字 6 近似' },
  ],
  '7': [
    { codepoint: 0x0417, lookalike: '西里尔 ѓ (U+0403)', description: '近似 7' },
  ],
  '8': [
    { codepoint: 0x0412, lookalike: '西里尔 В (U+0412)', description: '西里尔 В → 数字 8 近似' },
  ],
  '9': [
    { codepoint: 0x043e, lookalike: '西里尔 о (U+043E)', description: '西里尔 о → 数字 9 近似' },
  ],
  '.': [
    { codepoint: 0x02d9, lookalike: '上标点 (U+02D9)', description: '上标点 → 点号' },
    { codepoint: 0x2024, lookalike: '一个点引导符 (U+2024)', description: '引导符 → 点号' },
  ],
  '-': [
    { codepoint: 0x2010, lookalike: '连字符 (U+2010)', description: '连字符 → 减号' },
    { codepoint: 0x2011, lookalike: '不间断连字符 (U+2011)', description: '不间断连字符 → 减号' },
    { codepoint: 0x2019, lookalike: '右单引号 (U+2019)', description: '引号 → 减号近似' },
    { codepoint: 0x00ad, lookalike: '软连字符 (U+00AD)', description: '软连字符 → 不可见或减号' },
  ],
  _: [
    { codepoint: 0x2017, lookalike: '双下划线符 (U+2017)', description: '双下划线符 → 下划线' },
  ],
  '/': [
    { codepoint: 0x2044, lookalike: '分数斜线 (U+2044)', description: '分数斜线 → 斜杠' },
    { codepoint: 0x2215, lookalike: '除号斜线 (U+2215)', description: '除号斜线 → 斜杠' },
  ],
  '\\': [
    { codepoint: 0x29f5, lookalike: '反向双积分斜线 (U+29F5)', description: '近似反斜杠' },
    { codepoint: 0x2316, lookalike: '位置图 (U+2316)', description: '反斜杠变体' },
  ],
  '(': [
    { codepoint: 0x2768, lookalike: '中等左圆括号 (U+2768)', description: '装饰圆括号' },
  ],
  ')': [
    { codepoint: 0x2769, lookalike: '中等右圆括号 (U+2769)', description: '装饰圆括号' },
  ],
  '[': [
    { codepoint: 0x27e6, lookalike: '左方括号扩展 (U+27E6)', description: '方括号变体' },
  ],
  ']': [
    { codepoint: 0x27e7, lookalike: '右方括号扩展 (U+27E7)', description: '方括号变体' },
  ],
  ':': [
    { codepoint: 0x0589, lookalike: '亚美尼亚冒号 (U+0589)', description: '亚美尼亚冒号 → 冒号' },
    { codepoint: 0x2236, lookalike: '比例号 (U+2236)', description: '比例号 → 冒号' },
  ],
  ';': [
    { codepoint: 0x037e, lookalike: '希腊问号 (U+037E)', description: '希腊问号 → 分号' },
  ],
  ',': [
    { codepoint: 0x201a, lookalike: '低单引号 (U+201A)', description: '低单引号 → 逗号' },
    { codepoint: 0x055d, lookalike: '亚美尼亚逗号 (U+055D)', description: '亚美尼亚逗号 → 逗号' },
  ],
  "'": [
    { codepoint: 0x2018, lookalike: '左单引号 (U+2018)', description: '左单引号 → 撇号' },
    { codepoint: 0x2019, lookalike: '右单引号 (U+2019)', description: '右单引号 → 撇号' },
    { codepoint: 0x02bc, lookalike: '改音撇 (U+02BC)', description: '改音撇 → 撇号' },
    { codepoint: 0x055a, lookalike: '亚美尼亚重音 (U+055A)', description: '亚美尼亚重音 → 撇号' },
  ],
  '"': [
    { codepoint: 0x201c, lookalike: '左双引号 (U+201C)', description: '左双引号 → 引号' },
    { codepoint: 0x201d, lookalike: '右双引号 (U+201D)', description: '右双引号 → 引号' },
    { codepoint: 0x201e, lookalike: '低双引号 (U+201E)', description: '低双引号 → 引号' },
    { codepoint: 0x301d, lookalike: '反向双引号 (U+301D)', description: '反向双引号 → 引号' },
  ],
  '!': [
    { codepoint: 0x01c3, lookalike: '拉丁字母点击声 (U+01C3)', description: '拉丁变体 → 感叹号' },
  ],
  '?': [
    { codepoint: 0x0294, lookalike: '拉丁字母声门塞音 (U+0294)', description: '声门塞音 → 问号近似' },
    { codepoint: 0x055e, lookalike: '亚美尼亚问号 (U+055E)', description: '亚美尼亚问号' },
  ],
  '<': [
    { codepoint: 0x2039, lookalike: '单左尖引号 (U+2039)', description: '尖引号 → 小于号近似' },
    { codepoint: 0x276e, lookalike: '左装饰箭头 (U+276E)', description: '装饰箭头 → 小于号' },
  ],
  '>': [
    { codepoint: 0x203a, lookalike: '单右尖引号 (U+203A)', description: '尖引号 → 大于号近似' },
    { codepoint: 0x276f, lookalike: '右装饰箭头 (U+276F)', description: '装饰箭头 → 大于号' },
  ],
  '&': [
    { codepoint: 0x214b, lookalike: '反转符号 (U+214B)', description: '反转 & 变体' },
  ],
  '#': [
    { codepoint: 0x2114, lookalike: '集合基数符号 (U+2114)', description: '集合符号 → # 近似' },
  ],
  $: [
    { codepoint: 0x0192, lookalike: '拉丁 ƒ (U+0192)', description: '变体 → $ 近似' },
  ],
  '*': [
    { codepoint: 0x204e, lookalike: '低星号 (U+204E)', description: '星号变体' },
    { codepoint: 0x2722, lookalike: '四角星 (U+2722)', description: '四角星 → *' },
  ],
  '+': [
    { codepoint: 0x207a, lookalike: '上标加号 (U+207A)', description: '上标 → +' },
    { codepoint: 0x208a, lookalike: '下标加号 (U+208A)', description: '下标 → +' },
  ],
  '=': [
    { codepoint: 0x207c, lookalike: '上标等号 (U+207C)', description: '上标 → =' },
    { codepoint: 0x208c, lookalike: '下标等号 (U+208C)', description: '下标 → =' },
  ],
};

function buildReverseHomoglyphIndex(): Map<number, {
  original: string;
  lookalike: string;
  description: string;
  originalScript: ScriptCategory;
}> {
  const index = new Map<number, {
    original: string;
    lookalike: string;
    description: string;
    originalScript: ScriptCategory;
  }>();
  for (const [originalChar, entries] of Object.entries(HOMOGLYPH_MAP)) {
    const originalScript = detectScript(originalChar.codePointAt(0) ?? 0);
    for (const entry of entries) {
      index.set(entry.codepoint, {
        original: originalChar,
        lookalike: entry.lookalike,
        description: entry.description,
        originalScript,
      });
    }
  }
  return index;
}

const REVERSE_HOMOGLYPH_INDEX = buildReverseHomoglyphIndex();

// ================================================================
// 脚本混合检测
// ================================================================

function analyzeScriptMix(chars: CharScriptInfo[]): ScriptMixInfo {
  const counts: Record<ScriptCategory, number> = {
    Latin: 0, Cyrillic: 0, Greek: 0, Arabic: 0, Hebrew: 0,
    CJK: 0, Devanagari: 0, Hangul: 0, Thai: 0, Armenian: 0,
    Georgian: 0, Common: 0, Inherited: 0, Unknown: 0,
  };

  for (const c of chars) {
    counts[c.script] = (counts[c.script] ?? 0) + 1;
  }

  const letterScripts: ScriptCategory[] = [
    'Latin', 'Cyrillic', 'Greek', 'Arabic', 'Hebrew',
    'Devanagari', 'Thai', 'Armenian', 'Georgian',
  ];
  const usedLetterScripts = letterScripts.filter((s) => (counts[s] ?? 0) > 0);

  let dominant: ScriptCategory = 'Common';
  let maxCount = 0;
  for (const s of letterScripts) {
    const c = counts[s] ?? 0;
    if (c > maxCount) {
      maxCount = c;
      dominant = s;
    }
  }
  if (maxCount === 0) {
    if ((counts['CJK'] ?? 0) > 0) dominant = 'CJK';
    else if ((counts['Hangul'] ?? 0) > 0) dominant = 'Hangul';
  }

  const mixed = usedLetterScripts.length >= 2;

  let suspicious = false;
  if (mixed) {
    const latinCount = counts['Latin'] ?? 0;
    const cyrillicCount = counts['Cyrillic'] ?? 0;
    const greekCount = counts['Greek'] ?? 0;
    if (latinCount > 0 && cyrillicCount > 0) suspicious = true;
    if (latinCount > 0 && greekCount > 0) suspicious = true;
    if (latinCount > 0 && cyrillicCount > 0 && greekCount > 0) suspicious = true;
  }

  return {
    dominantScript: dominant,
    scriptsUsed: counts,
    mixed,
    suspiciousMix: suspicious,
  };
}

// ================================================================
// 主分析函数
// ================================================================

export function analyzeHomoglyph(input: string): ToolResult<HomoglyphAnalysisResult> {
  if (!input) return fail('EMPTY_INPUT');
  const trimmed = input;
  if (!trimmed) return fail('EMPTY_INPUT');

  const allCharInfo: CharScriptInfo[] = [];
  const invisibleChars: InvisibleCharIssue[] = [];
  const homoglyphs: HomoglyphMatch[] = [];

  const codePoints = Array.from(trimmed);
  let normalized = '';

  for (let i = 0; i < codePoints.length; i++) {
    const ch = codePoints[i];
    const cp = ch.codePointAt(0) ?? 0;
    const hex = 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
    const script = detectScript(cp);

    allCharInfo.push({
      char: ch,
      codePoint: cp,
      hex,
      script,
    });

    const invis = detectInvisibleChar(cp);
    if (invis) {
      invisibleChars.push({
        char: ch,
        codePoint: cp,
        hex,
        index: i,
        category: invis.category,
        description: invis.description,
      });
    } else {
      normalized += ch;
    }

    const hm = REVERSE_HOMOGLYPH_INDEX.get(cp);
    if (hm) {
      homoglyphs.push({
        char: ch,
        codePoint: cp,
        hex,
        index: i,
        lookalike: hm.original,
        lookalikeScript: hm.originalScript,
        originalScript: script,
        description: hm.description,
      });
    }
  }

  const scriptMix = analyzeScriptMix(allCharInfo);

  let punycodeDecoded: string | null = null;
  let isPunycode = false;
  const lowerNorm = normalized.toLowerCase();
  if (lowerNorm.includes('xn--')) {
    const decoded = punycodeDecodeDomain(normalized);
    if (decoded.success && decoded.data.isPunycode) {
      punycodeDecoded = decoded.data.decoded;
      isPunycode = true;
    }
  }

  const summary: string[] = [];
  let severity: ConfusionSeverity = 'info';
  let hasIssue = false;

  if (invisibleChars.length > 0) {
    hasIssue = true;
    const bidiCount = invisibleChars.filter((c) => c.category === 'BIDI').length;
    const zwCount = invisibleChars.filter((c) => c.category === 'ZERO_WIDTH').length;
    if (bidiCount > 0) {
      severity = 'critical';
      summary.push(`检测到 ${bidiCount} 个 BIDI 控制字符，可能用于文本方向欺骗（Trojan Source 攻击）`);
    } else if (zwCount > 0) {
      severity = severity === 'info' ? 'warning' : severity;
      summary.push(`检测到 ${zwCount} 个零宽字符，可能用于信息隐藏或视觉混淆`);
    } else {
      severity = severity === 'info' ? 'warning' : severity;
      summary.push(`检测到 ${invisibleChars.length} 个不可见/混淆字符`);
    }
  }

  if (scriptMix.suspiciousMix) {
    hasIssue = true;
    const scripts: string[] = [];
    for (const [s, c] of Object.entries(scriptMix.scriptsUsed)) {
      if (c > 0 && ['Latin', 'Cyrillic', 'Greek'].includes(s)) {
        scripts.push(s);
      }
    }
    if (severity !== 'critical') severity = 'warning';
    summary.push(`脚本混合：检测到 ${scripts.join(' / ')} 混用，可能为同形异义字钓鱼攻击`);
  } else if (scriptMix.mixed) {
    summary.push('检测到多脚本混用（非高风险组合）');
  }

  if (homoglyphs.length > 0) {
    hasIssue = true;
    if (severity !== 'critical') severity = 'warning';
    summary.push(`发现 ${homoglyphs.length} 个潜在同形异义字（与拉丁/ASCII 字符视觉高度相似）`);
  }

  if (isPunycode && punycodeDecoded) {
    hasIssue = true;
    if (severity === 'info') severity = 'warning';
    summary.push(`域名是 Punycode 编码，解码后为：${punycodeDecoded}`);
  }

  if (!hasIssue) {
    summary.push('未检测到明显的同形异义字或混淆字符问题');
  }

  const metadata: Record<string, string> = {};
  metadata.severity = severity;
  if (invisibleChars.length > 0) metadata.invisibleCount = String(invisibleChars.length);
  if (homoglyphs.length > 0) metadata.homoglyphCount = String(homoglyphs.length);
  if (isPunycode) metadata.isPunycode = 'true';
  if (scriptMix.mixed) metadata.mixedScripts = 'true';

  return success(
    {
      normalized,
      hasIssue,
      severity,
      scriptMix,
      invisibleChars,
      homoglyphs,
      punycodeDecoded,
      isPunycode,
      allCharInfo,
      summary,
    },
    metadata,
  );
}

// ================================================================
// 便捷函数：纯字符串清理（移除不可见字符）
// ================================================================

export function cleanConfusableChars(input: string): ToolResult<{
  cleaned: string;
  removedCount: number;
  removed: InvisibleCharIssue[];
}> {
  if (!input) return fail('EMPTY_INPUT');
  const result = analyzeHomoglyph(input);
  if (!result.success) return fail(result.error!);

  const removed = result.data.invisibleChars;
  return success(
    {
      cleaned: result.data.normalized,
      removedCount: removed.length,
      removed,
    },
    removed.length > 0 ? { removedCount: String(removed.length) } : undefined,
  );
}

// ================================================================
// 便捷函数：列出所有字符详细信息
// ================================================================

export function listCharDetails(input: string): ToolResult<CharScriptInfo[]> {
  if (!input) return fail('EMPTY_INPUT');
  const chars: CharScriptInfo[] = [];
  const codePoints = Array.from(input);
  for (const ch of codePoints) {
    const cp = ch.codePointAt(0) ?? 0;
    const hex = 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
    const script = detectScript(cp);
    chars.push({ char: ch, codePoint: cp, hex, script });
  }
  return success(chars);
}

// ================================================================
// 便捷函数：判断字符串是否"视觉混淆风险"
// ================================================================

export function hasConfusionRisk(input: string): ToolResult<{
  risky: boolean;
  reasons: string[];
}> {
  if (!input) return fail('EMPTY_INPUT');
  const result = analyzeHomoglyph(input);
  if (!result.success) return fail(result.error!);
  return success(
    {
      risky: result.data.hasIssue,
      reasons: result.data.summary,
    },
    result.data.hasIssue ? { severity: result.data.severity } : undefined,
  );
}
