import { describe, it, expect } from 'vitest';
import { analyzeUrl, parseUrlOnly } from '../utils/url-analyzer';

describe('url-analyzer — URL 拆解与结构分析', () => {
  it('普通 HTTPS URL 各字段解析正确（parsed.*）', () => {
    const res = analyzeUrl('https://user:pass@admin.example.com:8443/path/to/page?x=1&y=2#section');
    expect(res.success).toBe(true);
    const p = res.data!.parsed;
    expect(p.protocol).toBe('https:'); // URL 原生行为：协议带冒号
    expect(p.hostname).toBe('admin.example.com');
    expect(p.port).toBe('8443');
    expect(p.pathname).toBe('/path/to/page');
    expect(p.username).toBe('user');
    expect(p.password).toBe('pass');
    const queryKeys = p.queryParams.map((q) => q.key);
    expect(queryKeys).toEqual(['x', 'y']);
    const xParam = p.queryParams.find((q) => q.key === 'x');
    expect(xParam?.value).toBe('1');
    expect(p.hash).toBe('#section');
    // hostname = admin.example.com → 末尾 .com 是 TLD，根域名 example.com
    expect(p.hostname.endsWith('.com')).toBe(true);
    expect(p.hostname.includes('example')).toBe(true);
  });

  it('不带协议的 URL parseUrlOnly 自动补 https', () => {
    const res = parseUrlOnly('example.com/foo');
    expect(res.success).toBe(true);
    expect(res.data?.protocol).toBe('https:'); // 自动补全协议后同样遵循 URL 原生格式（带冒号）
    expect(res.data?.hostname).toBe('example.com');
  });

  it('IP:Port 形式正确拆解 hostname / port', () => {
    const res = analyzeUrl('http://127.0.0.1:8080/api/health');
    expect(res.success).toBe(true);
    const p = res.data!.parsed;
    expect(p.hostname).toBe('127.0.0.1');
    expect(p.port).toBe('8080');
    expect(p.pathname).toBe('/api/health');
  });

  it('普通安全域名（apple.com）无 critical/warning SecurityWarning', () => {
    const res = analyzeUrl('https://apple.com/privacy');
    expect(res.success).toBe(true);
    const serious = res.data!.securityWarnings.filter((w) => w.level === 'critical' || w.level === 'warning');
    expect(serious.length).toBe(0);
  });

  it('parseUrlOnly 无效 URL 返回 success=false，不抛异常', () => {
    const res = parseUrlOnly('this is not a url at all !@#$%');
    expect(res.success).toBe(false);
    expect(res.error).toBeTruthy();
  });
});
