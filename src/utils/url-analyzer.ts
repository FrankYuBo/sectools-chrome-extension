// ============================================================
// URL 分析模块 — 实现
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

export interface UrlParam {
  key: string;
  value: string;
  decodedValue: string | null;
  hints: EncodingHint[];
}

export interface UrlQueryParam extends UrlParam {}

export interface UrlHashParam extends UrlParam {}

export type EncodingHintType =
  | 'JWT'
  | 'BASE64'
  | 'URL_ENCODED'
  | 'HEX'
  | 'JSON'
  | 'MULTILAYER_ENCODED';

export interface EncodingHint {
  type: EncodingHintType;
  confidence: 'high' | 'medium' | 'low';
  preview?: string;
  description: string;
}

export interface ParsedUrl {
  raw: string;
  protocol: string;
  username: string;
  password: string;
  hostname: string;
  port: string | null;
  pathname: string;
  pathSegments: string[];
  search: string;
  queryParams: UrlQueryParam[];
  hash: string;
  hashParams: UrlHashParam[];
  hashPath: string | null;
  origin: string;
  fullPath: string;
}

export interface UrlAnalysisResult {
  parsed: ParsedUrl;
  securityWarnings: SecurityWarning[];
  overallHints: EncodingHint[];
}

export interface SecurityWarning {
  level: 'critical' | 'warning' | 'info';
  code: string;
  message: string;
  location?: string;
}

// ================================================================
// 编码检测工具
// ================================================================

function looksLikeJwt(text: string): boolean {
  const parts = text.split('.');
  if (parts.length !== 3) return false;
  const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
  if (!base64UrlPattern.test(parts[0]) || !base64UrlPattern.test(parts[1])) {
    return false;
  }
  try {
    const headerStr = urlSafeBase64DecodeToString(parts[0]);
    const header = JSON.parse(headerStr);
    return typeof header === 'object' && header !== null && 'alg' in header;
  } catch {
    return false;
  }
}

function looksLikeBase64(text: string): boolean {
  if (text.length < 4) return false;
  const clean = text.replace(/=+$/, '');
  if (!/^[A-Za-z0-9+/_-]+$/.test(clean)) return false;
  if (!/[A-Za-z]/.test(clean)) return false;
  const padCount = (4 - (clean.length % 4)) % 4;
  const padded = clean + '='.repeat(padCount);
  try {
    atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    return true;
  } catch {
    return false;
  }
}

function looksLikeHex(text: string): boolean {
  if (text.length < 2 || text.length % 2 !== 0) return false;
  return /^[0-9a-fA-F]+$/.test(text) && /[a-fA-F]/.test(text);
}

function looksLikeUrlEncoded(text: string): boolean {
  return /%[0-9a-fA-F]{2}/.test(text);
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if (!((first === '{' && last === '}') || (first === '[' && last === ']'))) {
    return false;
  }
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function urlSafeBase64DecodeToString(base64url: string): string {
  let normalized = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4 !== 0) normalized += '=';
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function tryDecodeJwt(text: string): string | null {
  if (!looksLikeJwt(text)) return null;
  try {
    const parts = text.split('.');
    const payloadStr = urlSafeBase64DecodeToString(parts[1]);
    const payload = JSON.parse(payloadStr);
    return JSON.stringify(payload, null, 2);
  } catch {
    return null;
  }
}

function tryDecodeBase64(text: string): string | null {
  if (!looksLikeBase64(text)) return null;
  try {
    let normalized = text.replace(/-/g, '+').replace(/_/g, '/');
    while (normalized.length % 4 !== 0) normalized += '=';
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function safeUrlDecode(text: string): string | null {
  try {
    return decodeURIComponent(text);
  } catch {
    return null;
  }
}

function truncatePreview(text: string, maxLen: number = 80): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + '...';
}

// ================================================================
// 对单个值生成编码提示
// ================================================================

export function detectEncodingHints(rawValue: string): EncodingHint[] {
  const hints: EncodingHint[] = [];

  if (!rawValue) return hints;

  if (looksLikeJwt(rawValue)) {
    const preview = tryDecodeJwt(rawValue);
    hints.push({
      type: 'JWT',
      confidence: 'high',
      preview: preview ? truncatePreview(preview) : undefined,
      description: '检测到 JWT (JSON Web Token)，可用 JWT 解码工具查看 header/payload 内容',
    });
  }

  if (looksLikeBase64(rawValue) && !looksLikeJwt(rawValue)) {
    const decoded = tryDecodeBase64(rawValue);
    let description = '检测到疑似 Base64 编码，可用 Base64 解码工具解码';
    // eslint-disable-next-line no-control-regex -- 故意检测不可打印控制字符
    if (decoded && /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(decoded)) {
      description += '（解码后含不可打印字符，可能是二进制数据）';
    } else if (decoded && looksLikeJson(decoded)) {
      description += '（解码后疑似 JSON 结构）';
    } else if (decoded && /^[A-Za-z0-9+/=_-]+$/.test(decoded) && decoded.length >= 4) {
      description += '（解码后仍像 Base64，可能存在多层编码）';
    }
    hints.push({
      type: 'BASE64',
      confidence: 'medium',
      preview: decoded ? truncatePreview(decoded) : undefined,
      description,
    });
  }

  if (looksLikeUrlEncoded(rawValue)) {
    const decoded = safeUrlDecode(rawValue);
    let description = '检测到 URL 编码 (percent-encoding)';
    if (decoded && (looksLikeJwt(decoded) || looksLikeBase64(decoded))) {
      description += '（解码后仍有编码层，可能存在多层嵌套）';
    }
    hints.push({
      type: 'URL_ENCODED',
      confidence: 'high',
      preview: decoded ? truncatePreview(decoded) : undefined,
      description,
    });
  }

  if (looksLikeHex(rawValue)) {
    hints.push({
      type: 'HEX',
      confidence: 'medium',
      description: '检测到疑似十六进制 (Hex) 字符串',
    });
  }

  if (looksLikeJson(rawValue)) {
    hints.push({
      type: 'JSON',
      confidence: 'high',
      description: '检测到 JSON 结构，可用 JSON 格式化工具美化',
    });
  }

  let nestedCount = 0;
  if (looksLikeUrlEncoded(rawValue)) {
    const decoded = safeUrlDecode(rawValue);
    if (decoded && (looksLikeBase64(decoded) || looksLikeUrlEncoded(decoded))) {
      nestedCount++;
    }
  }
  if (looksLikeBase64(rawValue)) {
    const decoded = tryDecodeBase64(rawValue);
    if (decoded && (looksLikeBase64(decoded) || looksLikeUrlEncoded(decoded) || looksLikeJson(decoded))) {
      nestedCount++;
    }
  }
  if (nestedCount >= 1 && hints.length >= 2) {
    hints.push({
      type: 'MULTILAYER_ENCODED',
      confidence: 'medium',
      description: '存在多层编码迹象，建议使用多层解码工具逐层展开',
    });
  }

  return hints;
}

// ================================================================
// URL 解析核心
// ================================================================

function parseQueryString(query: string): UrlQueryParam[] {
  const params: UrlQueryParam[] = [];
  if (!query || query === '?') return params;

  const cleanQuery = query.startsWith('?') ? query.substring(1) : query;
  if (!cleanQuery) return params;

  const pairs = cleanQuery.split('&');
  for (const pair of pairs) {
    if (!pair) continue;
    const eqIdx = pair.indexOf('=');
    let key: string;
    let value: string;
    if (eqIdx === -1) {
      key = pair;
      value = '';
    } else {
      key = pair.substring(0, eqIdx);
      value = pair.substring(eqIdx + 1);
    }

    const decodedKey = safeUrlDecode(key) ?? key;
    const decodedValue = safeUrlDecode(value);

    const rawHints = detectEncodingHints(value);
    const decodedHints = decodedValue ? detectEncodingHints(decodedValue) : [];
    const mergedHints = mergeEncodingHints(rawHints, decodedHints);

    params.push({
      key: decodedKey,
      value,
      decodedValue,
      hints: mergedHints,
    });
  }
  return params;
}

function mergeEncodingHints(a: EncodingHint[], b: EncodingHint[]): EncodingHint[] {
  const seen = new Set<EncodingHintType>();
  const result: EncodingHint[] = [];
  for (const h of a) {
    if (!seen.has(h.type)) {
      seen.add(h.type);
      result.push(h);
    }
  }
  for (const h of b) {
    if (!seen.has(h.type)) {
      seen.add(h.type);
      result.push(h);
    }
  }
  return result;
}

function parseHashFragment(hash: string): { hashPath: string | null; params: UrlHashParam[] } {
  const params: UrlHashParam[] = [];
  if (!hash || hash === '#') return { hashPath: null, params };

  const cleanHash = hash.startsWith('#') ? hash.substring(1) : hash;
  if (!cleanHash) return { hashPath: null, params };

  const qIdx = cleanHash.indexOf('?');
  const ampIdx = cleanHash.indexOf('&');
  const firstSep = qIdx === -1 ? ampIdx : ampIdx === -1 ? qIdx : Math.min(qIdx, ampIdx);

  if (firstSep === -1 && !/=/.test(cleanHash)) {
    return { hashPath: cleanHash, params };
  }

  let hashPath: string | null = null;
  let paramStr: string;

  if (firstSep !== -1 && firstSep > 0) {
    hashPath = cleanHash.substring(0, firstSep);
    paramStr = cleanHash.substring(firstSep + (cleanHash[firstSep] === '?' ? 1 : 0));
  } else {
    paramStr = cleanHash;
  }

  if (paramStr) {
    const pairs = paramStr.split('&');
    for (const pair of pairs) {
      if (!pair) continue;
      const eqIdx = pair.indexOf('=');
      let key: string;
      let value: string;
      if (eqIdx === -1) {
        key = pair;
        value = '';
      } else {
        key = pair.substring(0, eqIdx);
        value = pair.substring(eqIdx + 1);
      }
      const decodedKey = safeUrlDecode(key) ?? key;
      const decodedValue = safeUrlDecode(value);
      const rawHints = detectEncodingHints(value);
      const decodedHints = decodedValue ? detectEncodingHints(decodedValue) : [];
      const mergedHints = mergeEncodingHints(rawHints, decodedHints);
      params.push({
        key: decodedKey,
        value,
        decodedValue,
        hints: mergedHints,
      });
    }
  }

  return { hashPath, params };
}

function extractPathSegments(pathname: string): string[] {
  if (!pathname || pathname === '/') return [];
  const segments = pathname.split('/').filter((s) => s.length > 0);
  return segments.map((s) => safeUrlDecode(s) ?? s);
}

// ================================================================
// 安全警告检测
// ================================================================

const SUSPICIOUS_PARAM_NAMES = [
  'redirect', 'redirect_uri', 'redirect_url', 'next', 'return',
  'return_url', 'returnTo', 'callback', 'callback_url', 'dest',
  'destination', 'go', 'url', 'target', 'continue', 'forward',
  'ref', 'referer', 'image_url', 'img', 'src', 'href', 'link',
];

const DANGEROUS_PROTOCOLS = ['javascript:', 'vbscript:', 'data:text/html', 'file:'];

function generateSecurityWarnings(parsed: ParsedUrl): SecurityWarning[] {
  const warnings: SecurityWarning[] = [];

  const combined: { param: UrlParam; location: string }[] = [];
  parsed.queryParams.forEach((p) => combined.push({ param: p, location: `query:${p.key}` }));
  parsed.hashParams.forEach((p) => combined.push({ param: p, location: `hash:${p.key}` }));

  for (const { param, location } of combined) {
    const lowerKey = param.key.toLowerCase();
    if (SUSPICIOUS_PARAM_NAMES.includes(lowerKey) || SUSPICIOUS_PARAM_NAMES.some((s) => lowerKey.includes(s))) {
      const effectiveValue = param.decodedValue ?? param.value;
      let isDangerousUrl = false;
      try {
        const lower = effectiveValue.toLowerCase();
        for (const proto of DANGEROUS_PROTOCOLS) {
          if (lower.startsWith(proto)) {
            isDangerousUrl = true;
            warnings.push({
              level: 'critical',
              code: 'DANGEROUS_REDIRECT_PROTOCOL',
              message: `参数 ${param.key} 指向危险协议 ${proto}，可能存在 XSS/钓鱼风险`,
              location,
            });
            break;
          }
        }
        if (!isDangerousUrl) {
          try {
            new URL(effectiveValue);
            warnings.push({
              level: 'warning',
              code: 'OPEN_REDIRECT_CANDIDATE',
              message: `参数 ${param.key} 疑似跳转 URL，需关注是否存在未授权跳转漏洞`,
              location,
            });
          } catch {
            // 不是完整 URL，忽略
          }
        }
      } catch {
        // ignore
      }
    }

    const effectiveValue = param.decodedValue ?? param.value;
    for (const proto of DANGEROUS_PROTOCOLS) {
      if (effectiveValue.toLowerCase().startsWith(proto)) {
        warnings.push({
          level: 'critical',
          code: 'DANGEROUS_PROTOCOL_IN_VALUE',
          message: `参数 ${param.key} 的值包含危险协议 ${proto}`,
          location,
        });
      }
    }
  }

  if (parsed.username || parsed.password) {
    warnings.push({
      level: 'warning',
      code: 'CREDENTIALS_IN_URL',
      message: 'URL 中包含明文凭据 (username/password)，可能泄露敏感信息',
      location: 'authority',
    });
  }

  const lowerHost = parsed.hostname.toLowerCase();
  if (lowerHost.startsWith('xn--') || lowerHost.includes('.xn--')) {
    warnings.push({
      level: 'warning',
      code: 'PUNYCODE_DOMAIN',
      message: '域名使用 Punycode 编码，可能为同形异义字钓鱼域名，建议使用同形字检测工具进一步核验',
      location: 'hostname',
    });
  }

  return warnings;
}

// ================================================================
// 主分析函数
// ================================================================

export function analyzeUrl(input: string): ToolResult<UrlAnalysisResult> {
  if (!input) return fail('EMPTY_INPUT');
  const trimmed = input.trim();
  if (!trimmed) return fail('EMPTY_INPUT');

  let urlStr = trimmed;
  let addedProtocol = false;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(urlStr) && !urlStr.startsWith('/')) {
    urlStr = 'https://' + urlStr;
    addedProtocol = true;
  }

  let urlObj: URL;
  try {
    urlObj = new URL(urlStr);
  } catch (e) {
    return fail('INVALID_URL: ' + String(e));
  }

  const queryParams = parseQueryString(urlObj.search);
  const { hashPath, params: hashParams } = parseHashFragment(urlObj.hash);
  const pathSegments = extractPathSegments(urlObj.pathname);

  const hostname = addedProtocol ? urlObj.hostname : urlObj.hostname;

  const parsed: ParsedUrl = {
    raw: trimmed,
    protocol: urlObj.protocol,
    username: urlObj.username,
    password: urlObj.password,
    hostname,
    port: urlObj.port || null,
    pathname: urlObj.pathname,
    pathSegments,
    search: urlObj.search,
    queryParams,
    hash: urlObj.hash,
    hashParams,
    hashPath,
    origin: urlObj.origin,
    fullPath: urlObj.pathname + urlObj.search + urlObj.hash,
  };

  const securityWarnings = generateSecurityWarnings(parsed);

  const overallHints: EncodingHint[] = [];
  const allParamValues: string[] = [];
  queryParams.forEach((p) => allParamValues.push(p.decodedValue ?? p.value));
  hashParams.forEach((p) => allParamValues.push(p.decodedValue ?? p.value));
  pathSegments.forEach((s) => allParamValues.push(s));
  if (hashPath) allParamValues.push(hashPath);

  const allHints = new Map<string, EncodingHint>();
  for (const val of allParamValues) {
    const vHints = detectEncodingHints(val);
    for (const h of vHints) {
      const existing = allHints.get(h.type);
      if (!existing || (h.confidence === 'high' && existing.confidence !== 'high')) {
        allHints.set(h.type, h);
      }
    }
  }
  allHints.forEach((h) => overallHints.push(h));

  const metadata: Record<string, string> = {};
  if (securityWarnings.length > 0) {
    metadata.warningCount = String(securityWarnings.length);
    const criticalCount = securityWarnings.filter((w) => w.level === 'critical').length;
    if (criticalCount > 0) metadata.criticalCount = String(criticalCount);
  }
  if (queryParams.length > 0) metadata.queryParamCount = String(queryParams.length);
  if (hashParams.length > 0) metadata.hashParamCount = String(hashParams.length);

  return success(
    {
      parsed,
      securityWarnings,
      overallHints,
    },
    Object.keys(metadata).length > 0 ? metadata : undefined,
  );
}

// ================================================================
// 便捷函数：仅解析（不含深度分析）
// ================================================================

export function parseUrlOnly(input: string): ToolResult<ParsedUrl> {
  const result = analyzeUrl(input);
  if (!result.success) {
    return fail(result.error!);
  }
  return success(result.data.parsed, result.metadata ?? undefined);
}

// ================================================================
// 便捷函数：对任意字符串做编码提示检测（不限于 URL 上下文）
// ================================================================

export function analyzeStringEncoding(input: string): ToolResult<EncodingHint[]> {
  if (!input) return fail('EMPTY_INPUT');
  const trimmed = input.trim();
  if (!trimmed) return fail('EMPTY_INPUT');
  return success(detectEncodingHints(trimmed));
}
