// ============================================================
// 选中文本浮动工具栏 — 页面名单过滤（白名单优先 + 黑名单兜底）
// spec: .spec/selection-toolbar-filter.spec.yaml
//
// 判定语义（唯一入口 shouldShowSelectionToolbar）：
//   1. 总开关关闭            → 不启用
//   2. 白名单非空            → 命中白名单才启用（黑名单完全不参与）
//   3. 白名单空 / 黑名单非空 → 默认启用，命中黑名单不启用
//   4. 双空                  → 默认启用（全部页面弹框）
//
// 智能规则格式（一行一条，自动识别，白/黑名单共用）：
//   CIDR     192.168.0.0/16 | 10.1.2.3（单 IP 视为 /32）
//   通配符   *.example.com（任意层级子域，不含裸域）
//   域名     example.com（裸域 + 全部子域）
//   正则     /^10\./ 可带 i 标志（对 hostname 做 test）
//   *        单独一行匹配任意 hostname
// ============================================================
import type { AppSettings } from '../types';
import { ipInCidr } from './cidr';

export type SelectionRuleKind = 'cidr' | 'wildcard' | 'domain' | 'regex';

export interface SelectionRule {
  kind: SelectionRuleKind;
  /** 用户原始输入（trim 后） */
  raw: string;
  /** domain/wildcard：小写域名主体；cidr：规范化 CIDR；regex：正则体 */
  value: string;
  /** 仅 regex：标志（仅允许 i） */
  flags?: string;
  /** 仅 domain：单独一行 `*`，匹配任意 hostname */
  matchAll?: boolean;
  /** 仅 regex：解析时预编译好的实例（校验 + 匹配复用） */
  re?: RegExp;
}

export interface SelectionRuleIssue {
  /** 1-based 行号 */
  line: number;
  raw: string;
  reason: string;
}

export interface SelectionRulesValidation {
  /** 合法规则（保持输入顺序） */
  rules: SelectionRule[];
  /** 非法行（运行时自动忽略） */
  issues: SelectionRuleIssue[];
}

export const SELECTION_RULE_MAX_LINE_LENGTH = 500;
export const SELECTION_RULE_MAX_LINES = 100;

export type ParsedSelectionRule = { ok: true; rule: SelectionRule } | { ok: false; reason: string };

const CIDR_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/;
const WILDCARD_BASE_RE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const REGEX_RE = /^\/(.+)\/([a-z]*)$/;
const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function isIPv4(host: string): boolean {
  if (!IPV4_RE.test(host)) return false;
  return host.split('.').every((o) => Number(o) <= 255);
}

/** 解析单行规则；无法识别时返回原因 */
export function parseSelectionRule(rawLine: string): ParsedSelectionRule {
  const raw = rawLine.trim();
  const s = raw.toLowerCase();
  if (!s) return { ok: false, reason: '空行' };
  if (s.length > SELECTION_RULE_MAX_LINE_LENGTH) {
    return { ok: false, reason: `超过 ${SELECTION_RULE_MAX_LINE_LENGTH} 字符上限` };
  }

  // 单独一行 *：匹配任意 hostname（含 IPv6）
  if (s === '*') {
    return { ok: true, rule: { kind: 'domain', raw, value: '*', matchAll: true } };
  }

  // JS 正则：/body/ 或 /body/i
  if (s.startsWith('/')) {
    const m = REGEX_RE.exec(s);
    if (!m) return { ok: false, reason: '正则规则需以 / 开头并以 / 结尾' };
    const [, body, flags] = m;
    if (flags !== '' && flags !== 'i') return { ok: false, reason: '正则标志仅支持 i' };
    try {
      const re = new RegExp(body, flags);
      return { ok: true, rule: { kind: 'regex', raw, value: body, flags: flags || undefined, re } };
    } catch {
      return { ok: false, reason: '无效的正则表达式' };
    }
  }

  // CIDR / 单 IP（视为 /32）
  const cidr = CIDR_RE.exec(s);
  if (cidr) {
    const octets = [cidr[1], cidr[2], cidr[3], cidr[4]].map(Number);
    if (octets.some((o) => o > 255)) return { ok: false, reason: 'IPv4 地址非法（数值 > 255）' };
    const prefix = cidr[5] === undefined ? 32 : Number(cidr[5]);
    if (prefix > 32) return { ok: false, reason: 'CIDR 前缀长度需在 0-32 之间' };
    return { ok: true, rule: { kind: 'cidr', raw, value: `${octets.join('.')}/${prefix}` } };
  }

  // 通配符：*.example.com（任意层级子域，不含裸域）
  if (s.startsWith('*.')) {
    const base = s.slice(2);
    if (!WILDCARD_BASE_RE.test(base)) return { ok: false, reason: '通配符规则需形如 *.example.com' };
    return { ok: true, rule: { kind: 'wildcard', raw, value: base } };
  }

  // 纯域名：example.com（裸域 + 全部子域）
  if (DOMAIN_RE.test(s)) {
    return { ok: true, rule: { kind: 'domain', raw, value: s } };
  }

  return { ok: false, reason: '无法识别的规则格式（支持 域名 / *.通配符 / CIDR / /正则/）' };
}

/** 批量校验：解析各行规则，空行跳过，非法行记录行号与原因 */
export function validateSelectionRules(lines: string[]): SelectionRulesValidation {
  const rules: SelectionRule[] = [];
  const issues: SelectionRuleIssue[] = [];
  let validCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    if (validCount >= SELECTION_RULE_MAX_LINES) {
      issues.push({ line: i + 1, raw, reason: `有效规则超过 ${SELECTION_RULE_MAX_LINES} 行上限` });
      continue;
    }
    const parsed = parseSelectionRule(raw);
    if (parsed.ok) {
      rules.push(parsed.rule);
      validCount++;
    } else {
      issues.push({ line: i + 1, raw, reason: parsed.reason });
    }
  }
  return { rules, issues };
}

/** hostname 是否命中任一规则（hostname 小写、不含协议/端口） */
export function matchSelectionHost(hostname: string, rules: SelectionRule[]): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) return false;
  for (const rule of rules) {
    if (rule.matchAll) return true;
    switch (rule.kind) {
      case 'domain':
        if (host === rule.value || host.endsWith(`.${rule.value}`)) return true;
        break;
      case 'wildcard':
        if (host.endsWith(`.${rule.value}`)) return true;
        break;
      case 'cidr':
        if (isIPv4(host)) {
          const res = ipInCidr(host, rule.value);
          if (res.success && res.data.inRange) return true;
        }
        break;
      case 'regex':
        try {
          const re = rule.re ?? new RegExp(rule.value, rule.flags ?? '');
          if (re.test(host)) return true;
        } catch {
          // 非法正则忽略
        }
        break;
    }
  }
  return false;
}

/** 白名单优先 + 黑名单兜底 的总判定（content script 唯一入口） */
export function shouldShowSelectionToolbar(
  settings: Pick<
    AppSettings,
    'selectionToolbarEnabled' | 'selectionToolbarRules' | 'selectionToolbarBlockRules'
  >,
  hostname: string,
): boolean {
  if (!settings.selectionToolbarEnabled) return false;

  const whitelist = validateSelectionRules(settings.selectionToolbarRules ?? []).rules;
  if (whitelist.length > 0) return matchSelectionHost(hostname, whitelist);

  const blacklist = validateSelectionRules(settings.selectionToolbarBlockRules ?? []).rules;
  if (blacklist.length > 0) return !matchSelectionHost(hostname, blacklist);

  // 双空 → 默认全部页面弹框（保持 v0.2.x 默认行为）
  return true;
}
