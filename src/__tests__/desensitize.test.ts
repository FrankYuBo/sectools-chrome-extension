import { describe, it, expect } from 'vitest';
import { desensitize, getBuiltinRuleMeta } from '../utils/desensitize';
import type { BuiltInDesensitizeRuleId } from '../types';

describe('desensitize', () => {
  const allOn = Object.fromEntries(
    getBuiltinRuleMeta().map((r) => [r.id, true]),
  ) as Record<BuiltInDesensitizeRuleId, boolean>;

  const allOff: Record<string, boolean> = {};

  it('不启用任何规则时原样返回', () => {
    const text = 'IP 192.168.1.1 email test@test.com';
    expect(desensitize(text, allOff)).toBe(text);
  });

  it('脱敏 IPv4', () => {
    const text = '连接到 192.168.1.100 和 10.10.25.47';
    const result = desensitize(text, { ipv4: true });
    expect(result).toBe('连接到 192.***.***.100 和 10.***.***.47');
  });

  it('脱敏域名', () => {
    const text = '访问 malicious-cdn.update-service.net';
    const result = desensitize(text, { domain: true });
    expect(result).toBe('访问 ma***.update-service.net');
  });

  it('脱敏邮箱', () => {
    const text = '联系 jsmith@corp.com 和 admin@example.com';
    const result = desensitize(text, { email: true });
    expect(result).toBe('联系 j***@corp.com 和 a***@example.com');
  });

  it('脱敏手机号', () => {
    const text = '手机 13812345678';
    const result = desensitize(text, { phone_cn: true });
    expect(result).toBe('手机 138****5678');
  });

  it('脱敏身份证号', () => {
    const text = '身份证 110101199001011234';
    const result = desensitize(text, { idcard_cn: true });
    expect(result).toBe('身份证 110101********1234');
  });

  it('脱敏哈希', () => {
    const md5 = 'a3f8d2e1b9c4f7e6d2c1b3a4e5f6d7c8';
    const sha256 = 'a'.repeat(64);
    const result = desensitize(`${md5} ${sha256}`, { hash: true });
    expect(result).toContain('a3f8d2e1...(MD5)');
    expect(result).toContain('...(SHA-256)');
  });

  it('多条规则同时启用', () => {
    const text = 'IP 10.10.25.47 邮箱 jsmith@corp.com 手机 13812345678';
    const result = desensitize(text, allOn);
    expect(result).toContain('10.***.***.47');
    expect(result).toContain('j***@corp.com');
    expect(result).toContain('138****5678');
  });

  it('自定义正则规则', () => {
    const text = '用户张三工号 EMP-00123';
    const result = desensitize(text, {}, [
      { id: 'emp', label: '工号', pattern: 'EMP-\\d+', replacement: 'EMP-***', enabled: true },
    ]);
    expect(result).toBe('用户张三工号 EMP-***');
  });

  it('无效正则自定义规则不报错', () => {
    const text = 'hello';
    expect(() =>
      desensitize(text, {}, [
        { id: 'bad', label: 'bad', pattern: '[(', replacement: '', enabled: true },
      ]),
    ).not.toThrow();
  });

  it('禁用的自定义规则不生效', () => {
    const text = 'EMP-00123';
    const result = desensitize(text, {}, [
      { id: 'emp', label: '工号', pattern: 'EMP-\\d+', replacement: 'EMP-***', enabled: false },
    ]);
    expect(result).toBe('EMP-00123');
  });

  it('getBuiltinRuleMeta 返回全部内置规则', () => {
    const meta = getBuiltinRuleMeta();
    expect(meta.length).toBe(7);
    expect(meta.map((m) => m.id)).toContain('ipv4');
    expect(meta.map((m) => m.id)).toContain('hash');
  });
});
