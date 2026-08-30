import { describe, it, expect } from 'vitest';
import {
  parseSelectionRule,
  validateSelectionRules,
  matchSelectionHost,
  shouldShowSelectionToolbar,
  SELECTION_RULE_MAX_LINES,
} from '../utils/selection-filter';
import type { AppSettings } from '../types';
import { DEFAULT_TAB_ORDER, DEFAULT_AI_CONFIG } from '../types';

// ---- 测试辅助 ----
function mkSettings(overrides?: Partial<AppSettings>): AppSettings {
  return {
    themeMode: 'system',
    autoCopyResult: true,
    maxDecodeDepth: 10,
    defaultHashAlgorithm: 'SHA-256',
    indentSize: 2,
    timestampDefaultUnit: 's',
    defaultIntelSources: ['virustotal', 'threatbook'],
    selectionToolbarEnabled: true,
    selectionToolbarRules: [],
    selectionToolbarBlockRules: [],
    tabOrder: [...DEFAULT_TAB_ORDER],
    hiddenTabs: [],
    aiConfig: { ...DEFAULT_AI_CONFIG },
    ...overrides,
  };
}

function rulesOf(lines: string[]) {
  return validateSelectionRules(lines).rules;
}

// ---- 规则解析 ----
describe('parseSelectionRule', () => {
  it('解析纯域名（含大小写归一化）', () => {
    const r = parseSelectionRule(' Example.COM ');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rule.kind).toBe('domain');
      expect(r.rule.value).toBe('example.com');
    }
  });

  it('解析通配符 *.example.com', () => {
    const r = parseSelectionRule('*.example.com');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rule.kind).toBe('wildcard');
  });

  it('解析 CIDR 与单 IP（视为 /32）', () => {
    const cidr = parseSelectionRule('192.168.0.0/16');
    expect(cidr.ok).toBe(true);
    if (cidr.ok) {
      expect(cidr.rule.kind).toBe('cidr');
      expect(cidr.rule.value).toBe('192.168.0.0/16');
    }
    const ip = parseSelectionRule('172.16.5.4');
    expect(ip.ok).toBe(true);
    if (ip.ok) expect(ip.rule.value).toBe('172.16.5.4/32');
  });

  it('解析正则（含 i 标志）', () => {
    const r = parseSelectionRule('/^dev-/i');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rule.kind).toBe('regex');
      expect(r.rule.flags).toBe('i');
      expect(r.rule.re).toBeInstanceOf(RegExp);
    }
  });

  it('单独一行 * 匹配任意 hostname', () => {
    const r = parseSelectionRule('*');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rule.matchAll).toBe(true);
  });

  it('拒绝非法输入', () => {
    expect(parseSelectionRule('not a rule!!').ok).toBe(false);
    expect(parseSelectionRule('example.com:8080').ok).toBe(false); // 带端口
    expect(parseSelectionRule('/unclosed').ok).toBe(false); // 未闭合正则
    expect(parseSelectionRule('/x/g').ok).toBe(false); // 非法标志
    expect(parseSelectionRule('/(+/').ok).toBe(false); // 非法正则体
    expect(parseSelectionRule('999.1.1.1').ok).toBe(false); // octet > 255
    expect(parseSelectionRule('10.0.0.0/33').ok).toBe(false); // 前缀 > 32
    expect(parseSelectionRule('*.com').ok).toBe(false); // 通配符基域至少两段
    expect(parseSelectionRule('-bad-.com').ok).toBe(false); // 非法域名
  });

  it('拒绝超长行', () => {
    const long = 'a'.repeat(501);
    expect(parseSelectionRule(long).ok).toBe(false);
  });
});

// ---- 批量校验 ----
describe('validateSelectionRules', () => {
  it('空行跳过 + 非法行记录行号', () => {
    const v = validateSelectionRules(['good.com', '', '  ', 'bad rule!!', '10.0.0.0/8']);
    expect(v.rules).toHaveLength(2);
    expect(v.issues).toHaveLength(1);
    expect(v.issues[0].line).toBe(4);
    expect(v.issues[0].raw).toBe('bad rule!!');
  });

  it('超过 100 行上限时后续行标记非法', () => {
    const lines = Array.from({ length: SELECTION_RULE_MAX_LINES + 5 }, (_, i) => `a${i}.com`);
    const v = validateSelectionRules(lines);
    expect(v.rules).toHaveLength(SELECTION_RULE_MAX_LINES);
    expect(v.issues).toHaveLength(5);
  });
});

// ---- hostname 匹配 ----
describe('matchSelectionHost', () => {
  it('域名：裸域 + 子域命中，其他域不命中', () => {
    const rules = rulesOf(['example.com']);
    expect(matchSelectionHost('example.com', rules)).toBe(true);
    expect(matchSelectionHost('a.b.example.com', rules)).toBe(true);
    expect(matchSelectionHost('notexample.com', rules)).toBe(false);
    expect(matchSelectionHost('example.com.evil.io', rules)).toBe(false);
  });

  it('通配符：任意层级子域命中，裸域不命中', () => {
    const rules = rulesOf(['*.example.com']);
    expect(matchSelectionHost('a.example.com', rules)).toBe(true);
    expect(matchSelectionHost('x.y.example.com', rules)).toBe(true);
    expect(matchSelectionHost('example.com', rules)).toBe(false);
  });

  it('CIDR：网段内命中、网段外不命中', () => {
    const rules = rulesOf(['10.0.0.0/8', '172.16.5.4']);
    expect(matchSelectionHost('10.20.30.40', rules)).toBe(true);
    expect(matchSelectionHost('172.16.5.4', rules)).toBe(true); // 单 IP /32
    expect(matchSelectionHost('172.16.5.5', rules)).toBe(false);
    expect(matchSelectionHost('192.168.1.1', rules)).toBe(false);
  });

  it('正则：i 标志大小写不敏感，IPv6 可用正则匹配', () => {
    const rules = rulesOf(['/^dev-/i', '/^f[0-9a-f]+:/']);
    expect(matchSelectionHost('dev-portal.corp.io', rules)).toBe(true);
    expect(matchSelectionHost('DEV-portal.corp.io', rules)).toBe(true);
    expect(matchSelectionHost('fe80::1', rules)).toBe(true); // IPv6 正则命中
    expect(matchSelectionHost('google.com', rules)).toBe(false);
  });

  it('* 匹配任意 hostname（含 IPv6）', () => {
    const rules = rulesOf(['*']);
    expect(matchSelectionHost('anything.com', rules)).toBe(true);
    expect(matchSelectionHost('::1', rules)).toBe(true);
    expect(matchSelectionHost('10.0.0.1', rules)).toBe(true);
  });

  it('hostname 大小写归一化', () => {
    const rules = rulesOf(['example.com']);
    expect(matchSelectionHost('Sub.EXAMPLE.com', rules)).toBe(true);
  });

  it('空 hostname 不命中', () => {
    expect(matchSelectionHost('', rulesOf(['*']))).toBe(false);
    expect(matchSelectionHost('  ', rulesOf(['example.com']))).toBe(false);
  });
});

// ---- 总判定（白名单优先 + 黑名单兜底 + 双空全弹）----
describe('shouldShowSelectionToolbar', () => {
  it('ac-1/2：白名单命中才弹，未命中不弹', () => {
    const s = mkSettings({ selectionToolbarRules: ['*.corp.internal'] });
    expect(shouldShowSelectionToolbar(s, 'a.corp.internal')).toBe(true);
    expect(shouldShowSelectionToolbar(s, 'example.com')).toBe(false);
  });

  it('ac-3：总开关关闭一律不弹', () => {
    const s = mkSettings({
      selectionToolbarEnabled: false,
      selectionToolbarRules: ['*.corp.internal'],
    });
    expect(shouldShowSelectionToolbar(s, 'a.corp.internal')).toBe(false);
  });

  it('ac-4：CIDR 白名单', () => {
    const s = mkSettings({ selectionToolbarRules: ['10.0.0.0/8', '172.16.5.4'] });
    expect(shouldShowSelectionToolbar(s, '10.20.30.40')).toBe(true);
    expect(shouldShowSelectionToolbar(s, '172.16.5.4')).toBe(true);
    expect(shouldShowSelectionToolbar(s, '192.168.1.1')).toBe(false);
  });

  it('ac-5：白名单 * 等价全启用', () => {
    const s = mkSettings({ selectionToolbarRules: ['*'] });
    expect(shouldShowSelectionToolbar(s, 'any.site.io')).toBe(true);
  });

  it('ac-6：非法行运行时自动忽略', () => {
    const s = mkSettings({ selectionToolbarRules: ['good.com', '###'] });
    expect(shouldShowSelectionToolbar(s, 'good.com')).toBe(true);
    expect(shouldShowSelectionToolbar(s, 'other.com')).toBe(false);
  });

  it('ac-9：白名单空 + 黑名单非空 → 默认全弹、命中不弹', () => {
    const s = mkSettings({ selectionToolbarBlockRules: ['*.google.com'] });
    expect(shouldShowSelectionToolbar(s, 'example.org')).toBe(true);
    expect(shouldShowSelectionToolbar(s, 'mail.google.com')).toBe(false);
  });

  it('ac-10：白/黑名单同时命中时白名单优先', () => {
    const s = mkSettings({
      selectionToolbarRules: ['*.corp.internal'],
      selectionToolbarBlockRules: ['*.corp.internal'],
    });
    expect(shouldShowSelectionToolbar(s, 'a.corp.internal')).toBe(true);
  });

  it('ac-11：白名单 * + 黑名单 → 黑名单完全不参与', () => {
    const s = mkSettings({
      selectionToolbarRules: ['*'],
      selectionToolbarBlockRules: ['mail.google.com'],
    });
    expect(shouldShowSelectionToolbar(s, 'mail.google.com')).toBe(true);
  });

  it('ac-12：双空名单 → 全弹（默认全开，与 v0.2.x 行为一致）', () => {
    expect(shouldShowSelectionToolbar(mkSettings(), 'example.com')).toBe(true);
  });

  it('ac-13：黑名单 CIDR', () => {
    const s = mkSettings({ selectionToolbarBlockRules: ['192.168.0.0/16'] });
    expect(shouldShowSelectionToolbar(s, '10.0.0.1')).toBe(true);
    expect(shouldShowSelectionToolbar(s, '192.168.1.1')).toBe(false);
  });

  it('黑名单全部为非法行时等效双空（默认全弹）', () => {
    const s = mkSettings({ selectionToolbarBlockRules: ['###'] });
    expect(shouldShowSelectionToolbar(s, 'example.com')).toBe(true);
  });

  it('设置字段缺省（undefined 容错）', () => {
    const s = mkSettings();
    expect(shouldShowSelectionToolbar({ ...s, selectionToolbarRules: undefined as unknown as string[] }, 'x.com')).toBe(true);
  });
});
