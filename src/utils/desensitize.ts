// ============================================================
// 脱敏工具函数 — 纯函数，零 DOM 依赖，可独立单测
// ============================================================

import type {
  BuiltInDesensitizeRuleId,
  CustomDesensitizeRule,
} from '../types';

// --- 内置规则定义 ---
interface BuiltInRule {
  id: BuiltInDesensitizeRuleId;
  label: string;
  description: string;
  pattern: RegExp;
  /** replacement 函数：接收匹配的 groups，返回替换字符串 */
  replacer: (...args: string[]) => string;
}

const IPV4_RE = /\b((?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))\b/g;
const IPV6_RE = /\b([0-9a-fA-F]{1,4}(:[0-9a-fA-F]{1,4}){5,7})\b/g;
const DOMAIN_RE = /(?<!@)\b((?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,})\b/g;
const EMAIL_RE = /\b([a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,}))\b/g;
const PHONE_CN_RE = /\b(1[3-9]\d)(\d{4})(\d{4})\b/g;
const IDCARD_CN_RE = /\b(\d{6})(\d{8})(\d{4})\b/g;
const HASH_RE = /\b([a-fA-F0-9]{32}|[a-fA-F0-9]{40}|[a-fA-F0-9]{64}|[a-fA-F0-9]{128})\b/g;

export const BUILTIN_RULES: BuiltInRule[] = [
  {
    id: 'email',
    label: '邮箱地址',
    description: 'user@domain → u***@domain',
    pattern: EMAIL_RE,
    replacer: (_full, email: string, domain: string) => {
      const name = email.split('@')[0];
      return `${name.slice(0, 1)}***@${domain}`;
    },
  },
  {
    id: 'ipv4',
    label: 'IPv4 地址',
    description: '192.168.1.100 → 192.***.***.100',
    pattern: IPV4_RE,
    replacer: (_full, ip: string) => {
      const parts = ip.split('.');
      return `${parts[0]}.***.***.${parts[3]}`;
    },
  },
  {
    id: 'ipv6',
    label: 'IPv6 地址',
    description: '2001:db8::1 → 2001:****:...:1',
    pattern: IPV6_RE,
    replacer: (_full, addr: string) => {
      const parts = addr.split(':');
      if (parts.length <= 2) return addr;
      return `${parts[0]}:${'*'.repeat(4)}:...:${parts[parts.length - 1]}`;
    },
  },
  {
    id: 'domain',
    label: '域名',
    description: 'mail.internal.corp → ma***.internal.corp',
    pattern: DOMAIN_RE,
    replacer: (_full, domain: string) => {
      const parts = domain.split('.');
      if (parts.length <= 2) return `***.${parts[parts.length - 1]}`;
      return `${parts[0].slice(0, 2)}***.${parts.slice(1).join('.')}`;
    },
  },
  {
    id: 'phone_cn',
    label: '手机号（中国）',
    description: '13812345678 → 138****5678',
    pattern: PHONE_CN_RE,
    replacer: (_full, prefix: string, _middle: string, suffix: string) =>
      `${prefix}****${suffix}`,
  },
  {
    id: 'idcard_cn',
    label: '身份证号（中国）',
    description: '110101199001011234 → 110101********1234',
    pattern: IDCARD_CN_RE,
    replacer: (_full, area: string, _middle: string, check: string) =>
      `${area}********${check}`,
  },
  {
    id: 'hash',
    label: '文件哈希（MD5/SHA）',
    description: 'a3f8d2e1... → a3f8d2e1...(MD5)',
    pattern: HASH_RE,
    replacer: (_full, hash: string) =>
      `${hash.slice(0, 8)}...(${hash.length === 32 ? 'MD5' : hash.length === 40 ? 'SHA-1' : hash.length === 64 ? 'SHA-256' : 'SHA-512'})`,
  },
];

/**
 * 对文本执行脱敏处理
 * @param text 原始文本
 * @param builtInToggles 内置规则开关 { ipv4: true, ... }
 * @param customRules 自定义正则规则
 * @returns 脱敏后的文本
 */
export function desensitize(
  text: string,
  builtInToggles: Record<string, boolean>,
  customRules: CustomDesensitizeRule[] = [],
): string {
  let result = text;

  // 1. 应用内置规则（按 BUILTIN_RULES 顺序）
  for (const rule of BUILTIN_RULES) {
    if (!builtInToggles[rule.id]) continue;
    // 每条规则需要 fresh RegExp（带 g flag 的 RegExp lastIndex 问题）
    const re = new RegExp(rule.pattern.source, rule.pattern.flags);
    result = result.replace(re, (...args: string[]) => rule.replacer(...args));
  }

  // 2. 应用自定义规则
  for (const rule of customRules) {
    if (!rule.enabled || !rule.pattern) continue;
    try {
      const re = new RegExp(rule.pattern, 'g');
      result = result.replace(re, rule.replacement);
    } catch {
      // 正则无效则跳过
    }
  }

  return result;
}

/**
 * 获取内置规则元数据列表（给设置 UI 用）
 */
export function getBuiltinRuleMeta(): Array<{ id: string; label: string; description: string }> {
  return BUILTIN_RULES.map((r) => ({ id: r.id, label: r.label, description: r.description }));
}
