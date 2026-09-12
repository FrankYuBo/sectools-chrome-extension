// ============================================================
// JWT 工具 — 深度解析 / 安全风险检测 / 签发伪造
// spec: .spec/jwt-tools.spec.yaml
// 全部纯函数或注入式（now 参数），签名经 Web Crypto HMAC
// ============================================================

import type { ToolResult } from '../types';

// ================================================================
// 类型
// ================================================================

export type JwtSecurityLevel = 'high' | 'medium' | 'low';

export interface JwtSecurityFinding {
  level: JwtSecurityLevel;
  code: string;
  title: string;
  detail: string;
  suggestion: string;
}

export type JwtTimeState = 'valid' | 'expired' | 'not-yet-valid' | 'unknown';

export interface JwtTimeFieldView {
  /** 原始数值 */
  raw: number;
  /** 本地可读时间 */
  human: string;
  /** 相对时间描述 */
  relative: string;
  /** exp/nbf 状态（iat 恒为 unknown） */
  state: JwtTimeState;
}

// ================================================================
// 标准字段中文解释（纯数据）
// ================================================================

export const JWT_HEADER_FIELD_DOCS: Record<string, string> = {
  alg: '签名算法（HS* = HMAC 对称密钥；RS*/ES*/PS* = 非对称私钥签名；none = 无签名）',
  typ: '令牌类型（JWT 默认）',
  kid: '密钥 ID（多密钥/密钥轮换场景）',
  cty: '内容类型（嵌套 JWT 时为 JWT）',
  jku: 'JWKS URL（远程拉取公钥，存在注入风险面）',
  x5u: 'X.509 证书 URL（远程证书，存在注入风险面）',
};

export const JWT_PAYLOAD_FIELD_DOCS: Record<string, string> = {
  iss: '签发者（Issuer）',
  sub: '主体（Subject，通常为用户 ID）',
  aud: '受众（Audience，目标服务）',
  exp: '过期时间（Expiration）',
  nbf: '生效时间（Not Before）',
  iat: '签发时间（Issued At）',
  jti: 'JWT 唯一标识（JWT ID，防重放）',
};

/** 已知安全算法白名单 */
const KNOWN_ALGS = new Set([
  'HS256', 'HS384', 'HS512',
  'RS256', 'RS384', 'RS512',
  'ES256', 'ES384', 'ES512',
  'PS256', 'PS384', 'PS512',
  'EdDSA',
]);

/** payload 敏感键名（不区分大小写） */
const SENSITIVE_KEY_RE = /^(password|passwd|pwd|secret|token|apikey|api_key|privatekey|private_key|phone|mobile|idcard|id_card|ssn|creditcard)$/i;

// ================================================================
// 时间字段解释
// ================================================================

/** 秒/毫秒自动识别：> 1e12 视为毫秒 */
function normalizeTs(v: number): number {
  return v > 1e12 ? Math.floor(v / 1000) : v;
}

function formatHuman(tsSec: number): string {
  const d = new Date(tsSec * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function formatRelative(diffSec: number): string {
  const abs = Math.abs(diffSec);
  const m = Math.floor(abs / 60);
  const h = Math.floor(abs / 3600);
  const d = Math.floor(abs / 86400);
  let span: string;
  if (abs < 60) span = `${abs} 秒`;
  else if (m < 60) span = `${m} 分钟`;
  else if (h < 24) span = `${h} 小时`;
  else if (d < 30) span = `${d} 天`;
  else span = `${Math.floor(d / 30)} 个月`;
  return diffSec >= 0 ? `${span}后` : `${span}前`;
}

/**
 * 解释 payload 中的 exp/nbf/iat 字段。
 * 返回各字段视图 + 总体状态（取最严格：expired > not-yet-valid > valid）。
 */
export function analyzeJwtTimeFields(
  payload: Record<string, unknown>,
  now: number = Date.now(),
): { fields: Partial<Record<'exp' | 'nbf' | 'iat', JwtTimeFieldView>>; overall: JwtTimeState } {
  const nowSec = Math.floor(now / 1000);
  const fields: Partial<Record<'exp' | 'nbf' | 'iat', JwtTimeFieldView>> = {};
  let overall: JwtTimeState = 'unknown';

  const handle = (key: 'exp' | 'nbf' | 'iat', stateKind: 'expiry' | 'nbf' | 'none') => {
    const v = payload[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) return;
    const tsSec = normalizeTs(v);
    let state: JwtTimeState = 'unknown';
    if (stateKind === 'expiry') {
      state = tsSec < nowSec ? 'expired' : 'valid';
    } else if (stateKind === 'nbf') {
      state = tsSec > nowSec ? 'not-yet-valid' : 'valid';
    }
    fields[key] = { raw: v, human: formatHuman(tsSec), relative: formatRelative(tsSec - nowSec), state };
    if (state === 'expired') overall = 'expired';
    else if (state === 'not-yet-valid' && overall !== 'expired') overall = 'not-yet-valid';
    else if (state === 'valid' && overall === 'unknown') overall = 'valid';
  };

  handle('iat', 'none');
  handle('nbf', 'nbf');
  handle('exp', 'expiry');
  return { fields, overall };
}

// ================================================================
// 安全风险检测
// ================================================================

export function checkJwtSecurity(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  _now: number = Date.now(), // 保留注入参数供未来基于时间的检查使用
): JwtSecurityFinding[] {
  const findings: JwtSecurityFinding[] = [];
  const alg = typeof header.alg === 'string' ? header.alg : '';

  // ALG_NONE（高危）
  if (!alg || alg.toLowerCase() === 'none') {
    findings.push({
      level: 'high',
      code: 'ALG_NONE',
      title: 'alg=none 无签名令牌',
      detail: '令牌未签名（或 header 缺失 alg）。若服务端不校验签名，攻击者可伪造任意身份与权限字段。',
      suggestion: '服务端必须拒绝 alg=none；确认签名校验逻辑覆盖算法白名单。',
    });
  }

  // ALG_CONFUSION_HINT（中危）：HS* + kid
  if (/^HS(256|384|512)$/.test(alg) && 'kid' in header) {
    findings.push({
      level: 'medium',
      code: 'ALG_CONFUSION_HINT',
      title: 'HS* 对称签名且存在 kid（算法混淆攻击面）',
      detail: '若服务端同时支持非对称算法且误用公钥做 HMAC 校验，攻击者可用泄露的公钥伪造令牌（RS→HS 降级攻击）。',
      suggestion: '确认服务端算法固定为白名单单值，公钥绝不可用于 HMAC 校验。',
    });
  }

  // SENSITIVE_PAYLOAD（中危）
  const sensitiveKeys = Object.keys(payload).filter((k) => SENSITIVE_KEY_RE.test(k));
  if (sensitiveKeys.length > 0) {
    findings.push({
      level: 'medium',
      code: 'SENSITIVE_PAYLOAD',
      title: `payload 含敏感字段（${sensitiveKeys.join('、')}）`,
      detail: `检测到敏感键名：${sensitiveKeys.map((k) => `${k}(长度 ${String(payload[k]).length})`).join('、')}。JWT payload 仅 base64url 编码，任何持有令牌者可直接解码查看明文。`,
      suggestion: '敏感信息不应写入 JWT；已泄露的凭据应立即轮换。',
    });
  }

  // UNKNOWN_ALG（低危）—— alg=none 已由 ALG_NONE 覆盖，不重复提示
  if (alg && alg.toLowerCase() !== 'none' && !KNOWN_ALGS.has(alg)) {
    findings.push({
      level: 'low',
      code: 'UNKNOWN_ALG',
      title: `非标准算法 ${alg}`,
      detail: '算法不在常见白名单（HS*/RS*/ES*/PS*/EdDSA）内，可能是自定义实现或畸形令牌。',
      suggestion: '确认算法实现来源，自定义算法需独立安全评估。',
    });
  }

  // NO_EXPIRY（低危）
  if (typeof payload.exp !== 'number') {
    findings.push({
      level: 'low',
      code: 'NO_EXPIRY',
      title: '令牌缺少 exp（永不过期）',
      detail: '无过期时间的令牌一旦泄露将长期有效，无法通过自然过期止损。',
      suggestion: '签发时设置合理 exp；已泄露令牌需服务端黑名单机制吊销。',
    });
  }

  const order: Record<JwtSecurityLevel, number> = { high: 0, medium: 1, low: 2 };
  return findings.sort((a, b) => order[a.level] - order[b.level]);
}

// ================================================================
// 签发 / 伪造
// ================================================================

export type JwtSignAlg = 'HS256' | 'HS384' | 'HS512' | 'none';

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function strToBase64Url(s: string): string {
  return bytesToBase64Url(new TextEncoder().encode(s));
}

/** 用密钥签发 HS256/384/512 Token（Web Crypto HMAC） */
export async function signJwtHS(
  payload: Record<string, unknown>,
  secret: string,
  alg: 'HS256' | 'HS384' | 'HS512' = 'HS256',
  headerExtra: Record<string, unknown> = {},
): Promise<ToolResult<string>> {
  if (!secret) {
    return { success: false, data: '', error: 'EMPTY_SECRET', metadata: null };
  }
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    return { success: false, data: '', error: 'Web Crypto API 不可用（需安全上下文）', metadata: null };
  }
  try {
    const header = { alg, typ: 'JWT', ...headerExtra };
    const signingInput = `${strToBase64Url(JSON.stringify(header))}.${strToBase64Url(JSON.stringify(payload))}`;
    const hash = alg === 'HS256' ? 'SHA-256' : alg === 'HS384' ? 'SHA-384' : 'SHA-512';
    const key = await subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: { name: hash } },
      false,
      ['sign'],
    );
    const sig = await subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
    return { success: true, data: `${signingInput}.${bytesToBase64Url(new Uint8Array(sig))}`, error: null, metadata: null };
  } catch (e) {
    return { success: false, data: '', error: e instanceof Error ? e.message : 'SIGN_FAILED', metadata: null };
  }
}

/** 伪造 alg=none Token（header.payload. 空签名）——仅用于测试服务端签名校验 */
export function forgeJwtNone(
  payload: Record<string, unknown>,
  headerExtra: Record<string, unknown> = {},
): string {
  const header = { alg: 'none', typ: 'JWT', ...headerExtra };
  return `${strToBase64Url(JSON.stringify(header))}.${strToBase64Url(JSON.stringify(payload))}.`;
}

/** 解析自校验：签发结果与独立重算签名比对 */
export async function verifySelfConsistency(token: string, secret: string, alg: 'HS256' | 'HS384' | 'HS512'): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const reSign = await signJwtHS(
    JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(parts[1].length + ((4 - (parts[1].length % 4)) % 4), '='))) as Record<string, unknown>,
    secret,
    alg,
  );
  return reSign.success && reSign.data === token;
}
