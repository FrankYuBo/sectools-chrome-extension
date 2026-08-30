import { describe, it, expect } from 'vitest';
import {
  extractIocByType,
  groupIocsByType,
  extractHashes,
  extractNetworkIocs,
  highlightIocs,
} from '../utils/ioc-detector';

describe('ioc-detector — IOC 类型识别', () => {
  it('extractHashes 区分 SHA256 / MD5 / SHA1', () => {
    const text =
      'md5:d41d8cd98f00b204e9800998ecf8427e ' +
      'sha1:da39a3ee5e6b4b0d3255bfef95601890afd80709 ' +
      'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 end';
    const h = extractHashes(text);
    expect(h.md5.includes('d41d8cd98f00b204e9800998ecf8427e')).toBe(true);
    expect(h.sha1.includes('da39a3ee5e6b4b0d3255bfef95601890afd80709')).toBe(true);
    expect(h.sha256.includes('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')).toBe(true);
    expect(h.sha512.length).toBe(0);
  });

  it('extractNetworkIocs 识别 IPv4 / Domain / URL', () => {
    const text =
      'Visit http://evil.com/path?x=1 now, IP is 8.8.8.8 plus sub.a-b.co.jp';
    const net = extractNetworkIocs(text);
    expect(net.ipv4.includes('8.8.8.8')).toBe(true);
    expect(net.url.some((u) => u.startsWith('http://evil.com/'))).toBe(true);
    // 只断言纯文本域名 sub.a-b.co.jp 被提取（URL 中的 evil.com 是否进 domain 取决于具体实现策略）
    expect(net.domain.includes('sub.a-b.co.jp')).toBe(true);
  });

  it('extractIocByType — CVE 识别（返回 string[]）', () => {
    const ids = extractIocByType(
      'Patch CVE-2024-3400 and CVE-2021-44228 immediately',
      'cve',
    );
    expect(ids.includes('CVE-2024-3400')).toBe(true);
    expect(ids.includes('CVE-2021-44228')).toBe(true);
  });

  it('IDN 同形异义域名完整提取（希腊/西里尔字符不截断）', () => {
    // gοogle.com 中 ο 为希腊字母 U+03BF；аpple-id.com 首字符为西里尔 а U+0430
    const greek = 'gοogle.com';
    const cyrillic = 'аpple-id.com';
    expect(extractIocByType(greek, 'domain')).toEqual([greek]);
    expect(extractIocByType(cyrillic, 'domain')).toEqual([cyrillic]);
    // 混在中文句子中：中文不应被吞入域名，域名完整提取
    const text = '员工访问了仿冒站点 gοogle.com 以及 аpple-id.com 提交了凭据';
    const domains = extractIocByType(text, 'domain');
    expect(domains).toContain(greek);
    expect(domains).toContain(cyrillic);
    // 拉丁变体域名（如 è）也应完整提取
    expect(extractIocByType('cafè-login.com', 'domain')).toEqual(['cafè-login.com']);
    // 纯中文不得被误判为域名
    expect(extractIocByType('内部系统工单描述文本', 'domain')).toEqual([]);
  });

  it('extractIocByType — AS 号识别', () => {
    const ases = extractIocByType('Traffic from AS13335 and ASN64512 spike', 'as');
    expect(ases.includes('AS13335')).toBe(true);
  });

  it('groupIocsByType 按类型分组', () => {
    const grouped = groupIocsByType(
      'IP 1.1.1.1, SHA256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(grouped.ipv4.length).toBeGreaterThan(0);
    expect(grouped.sha256.length).toBeGreaterThan(0);
    expect(grouped.cve.length).toBe(0);
  });

  it('highlightIocs 返回 segments（至少 1 段）', () => {
    const res = highlightIocs('Hit 1.1.1.1 in logs');
    expect(res.success).toBe(true);
    expect(res.data!.length).toBeGreaterThan(0);
    expect(res.data!.some((s) => s.isIoc && s.iocValue === '1.1.1.1')).toBe(true);
  });
});
