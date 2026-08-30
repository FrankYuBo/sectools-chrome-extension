// ============================================================
// IOC 检测 — 内置正则表达式集合
// 用于从文本中提取常见的妥协指标 (Indicators of Compromise)
// ============================================================
import type { IocRegexPattern, IocType } from '../types';

// ================================================================
// 工具：IP 地址合法性校验
// ================================================================

function isValidIpv4(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return false;
    const n = parseInt(p, 10);
    if (n < 0 || n > 255) return false;
    if (p.length > 1 && p.startsWith('0')) return false;
  }
  return true;
}

function isValidIpv6(value: string): boolean {
  if (value.includes('::')) {
    const parts = value.split('::');
    if (parts.length > 2) return false;
    const left = parts[0] ? parts[0].split(':') : [];
    const right = parts[1] ? parts[1].split(':') : [];
    if (left.length + right.length > 8) return false;
    const groups = [...left, ...right];
    for (const g of groups) {
      if (g && !/^[0-9a-fA-F]{1,4}$/.test(g)) return false;
    }
    return true;
  }
  const groups = value.split(':');
  if (groups.length !== 8) return false;
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return false;
  }
  return true;
}

function isValidMac(value: string): boolean {
  const clean = value.replace(/[-:]/g, '');
  return /^[0-9a-fA-F]{12}$/.test(clean);
}

/**
 * IDN 域名 label 可用字母范围（BMP，覆盖同形异义字常见来源）：
 * 拉丁扩展 \u00C0-\u024F / 希腊 \u0370-\u03FF / 西里尔 \u0400-\u052F / 拉丁扩展增补 \u1E00-\u1EFF
 * 刻意排除 CJK（\u4E00+）/假名/谚文，防止中文文本被误吞入域名。
 */
const IDN_LABEL_CHARS = 'A-Za-z0-9\\u00C0-\\u024F\\u0370-\\u052F\\u1E00-\\u1EFF';

function isValidDomain(value: string): boolean {
  if (value.length > 253) return false;
  const labels = value.split('.');
  if (labels.length < 2) return false;
  const tld = labels[labels.length - 1];
  if (!/^[a-zA-Z]{2,}$/.test(tld)) return false;
  const labelRe = new RegExp(
    `^[${IDN_LABEL_CHARS}]([${IDN_LABEL_CHARS}-]*[${IDN_LABEL_CHARS}])?$`,
  );
  for (const label of labels) {
    if (label.length === 0 || label.length > 63) return false;
    if (!labelRe.test(label)) return false;
  }
  return true;
}

function isValidCve(value: string): boolean {
  const m = value.match(/^CVE-(\d{4})-(\d{4,7})$/i);
  if (!m) return false;
  const year = parseInt(m[1], 10);
  return year >= 1999 && year <= 2100;
}

function isValidBitcoin(value: string): boolean {
  if (!/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(value)) {
    if (!/^bc1[a-z0-9]{39,59}$/.test(value)) {
      return false;
    }
  }
  return true;
}

function isValidEthereum(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

// ================================================================
// 内置正则模式表（按优先级排序，数值越大优先级越高）
// ================================================================

export const BUILTIN_IOC_REGEXES: IocRegexPattern[] = [
  {
    type: 'sha512',
    label: 'SHA-512',
    pattern: /\b[a-fA-F0-9]{128}\b/g,
    description: 'SHA-512 哈希，128 位十六进制',
    priority: 100,
  },
  {
    type: 'sha256',
    label: 'SHA-256',
    pattern: /\b[a-fA-F0-9]{64}\b/g,
    description: 'SHA-256 哈希，64 位十六进制',
    priority: 95,
  },
  {
    type: 'sha1',
    label: 'SHA-1',
    pattern: /\b[a-fA-F0-9]{40}\b/g,
    description: 'SHA-1 哈希，40 位十六进制',
    priority: 90,
  },
  {
    type: 'md5',
    label: 'MD5',
    pattern: /\b[a-fA-F0-9]{32}\b/g,
    description: 'MD5 哈希，32 位十六进制',
    priority: 85,
  },
  {
    type: 'cve',
    label: 'CVE',
    pattern: /CVE-\d{4}-\d{4,7}/gi,
    description: 'CVE 漏洞编号，如 CVE-2024-1234',
    priority: 80,
    validator: isValidCve,
  },
  {
    type: 'ethereum',
    label: '以太坊地址',
    pattern: /0x[a-fA-F0-9]{40}\b/g,
    description: '以太坊钱包地址，0x 开头 + 40 位 hex',
    priority: 75,
    validator: isValidEthereum,
  },
  {
    type: 'bitcoin',
    label: '比特币地址',
    pattern: /\b(?:[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{39,59})\b/g,
    description: '比特币地址（P2PKH / P2SH / Bech32）',
    priority: 70,
    validator: isValidBitcoin,
  },
  {
    type: 'url',
    label: 'URL',
    pattern: /https?:\/\/[^\s<>"'`)\]]+(?:\([^\s<>"'`)]*\)|[^\s<>"'`.,;!?)\]])*/g,
    description: 'HTTP/HTTPS URL',
    priority: 65,
  },
  {
    type: 'email',
    label: '邮箱',
    pattern: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
    description: '电子邮箱地址',
    priority: 60,
  },
  {
    type: 'ipv6',
    label: 'IPv6',
    pattern: /(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}|:(?::[0-9a-fA-F]{1,4}){1,7}|fe80:(?::[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]+|::(?:ffff(?::0{1,4})?:)?(?:(?:25[0-5]|(?:2[0-4]|1?\d)?\d)\.){3}(?:25[0-5]|(?:2[0-4]|1?\d)?\d)|(?:[0-9a-fA-F]{1,4}:){1,4}:(?:(?:25[0-5]|(?:2[0-4]|1?\d)?\d)\.){3}(?:25[0-5]|(?:2[0-4]|1?\d)?\d))/g,
    description: 'IPv6 地址（含压缩格式、IPv4 嵌入格式）',
    priority: 55,
    validator: isValidIpv6,
  },
  {
    type: 'ipv4',
    label: 'IPv4',
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g,
    description: 'IPv4 地址（含合法性校验，排除 0 开头多位数）',
    priority: 50,
    validator: isValidIpv4,
  },
  {
    type: 'as',
    label: 'AS 编号',
    pattern: /\bAS(?:N)?\s*(\d{1,10})\b/gi,
    description: '自治系统编号，如 AS12345 或 ASN 12345',
    priority: 45,
  },
  {
    type: 'mac',
    label: 'MAC 地址',
    pattern: /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g,
    description: 'MAC 地址（冒号或连字符分隔）',
    priority: 40,
    validator: isValidMac,
  },
  {
    type: 'domain',
    label: '域名',
    pattern: new RegExp(
      `(?<![${IDN_LABEL_CHARS}-])(?:[${IDN_LABEL_CHARS}](?:[${IDN_LABEL_CHARS}-]{0,61}[${IDN_LABEL_CHARS}])?\\.)+[a-zA-Z]{2,}\\b`,
      'g',
    ),
    description: 'DNS 域名（含子域名，支持 IDN 国际化域名/同形异义字符）',
    priority: 30,
    validator: (v): boolean => {
      const excluded = /\b(?:example|test|invalid|localhost|domain)\.(?:com|net|org|local)$/i;
      if (excluded.test(v)) return false;
      return isValidDomain(v);
    },
  },
];

// ================================================================
// 按类型获取正则
// ================================================================

export function getRegexByType(type: IocType): IocRegexPattern | undefined {
  return BUILTIN_IOC_REGEXES.find((r) => r.type === type);
}

export function getRegexesByTypes(types: IocType[]): IocRegexPattern[] {
  return BUILTIN_IOC_REGEXES.filter((r) => types.includes(r.type));
}

export function getSortedRegexes(): IocRegexPattern[] {
  return [...BUILTIN_IOC_REGEXES].sort((a, b) => b.priority - a.priority);
}

// ================================================================
// 类型描述元数据（用于 UI 展示）
// ================================================================

export const IOC_TYPE_META: Record<IocType, { label: string; icon: string; color: string }> = {
  ipv4:      { label: 'IPv4',       icon: '🌐', color: '#2563eb' },
  ipv6:      { label: 'IPv6',       icon: '🔗', color: '#7c3aed' },
  domain:    { label: '域名',       icon: '🏷️', color: '#0891b2' },
  url:       { label: 'URL',        icon: '🔗', color: '#0284c7' },
  email:     { label: '邮箱',       icon: '📧', color: '#0d9488' },
  md5:       { label: 'MD5',        icon: '🔑', color: '#dc2626' },
  sha1:      { label: 'SHA-1',      icon: '🔐', color: '#ea580c' },
  sha256:    { label: 'SHA-256',    icon: '🛡️', color: '#ca8a04' },
  sha512:    { label: 'SHA-512',    icon: '🛡️', color: '#65a30d' },
  cve:       { label: 'CVE',        icon: '🐛', color: '#b91c1c' },
  as:        { label: 'AS 编号',    icon: '🏢', color: '#4f46e5' },
  bitcoin:   { label: 'BTC 地址',   icon: '₿',  color: '#f7931a' },
  ethereum:  { label: 'ETH 地址',   icon: 'Ξ',  color: '#627eea' },
  mac:       { label: 'MAC 地址',   icon: '📟', color: '#059669' },
};
