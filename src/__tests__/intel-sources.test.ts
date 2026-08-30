import { describe, it, expect } from 'vitest';
import {
  buildIntelLink,
  getIntelSource,
  INTEL_SOURCES,
  getIntelSourcesByType,
  buildAllIntelLinks,
} from '../utils/intel-sources';
import type { IocType, IntelSourceType } from '../types';

describe('intel-sources — 核心：微步 ThreatBook 统一 generalSearch（修复 notFound/404 回归）', () => {
  const SAMPLES: Record<IocType, string> = {
    ipv4: '1.1.1.1',
    ipv6: '2606:4700:4700::1111',
    domain: 'malicious.example.com',
    url: 'https://example.com/phish',
    md5: 'd41d8cd98f00b204e9800998ecf8427e',
    sha1: 'da39a3ee5e6b4b0d3255bfef95601890afd80709',
    sha256:
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    sha512: 'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e',
    email: 'phish@example.com',
    cve: 'CVE-2024-3400',
    as: 'AS13335',
    bitcoin: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    ethereum: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    mac: '00:1A:2B:3C:4D:5E',
  };

  it('ThreatBook 所有 IOC 类型统一走 generalSearch URL（核心修复验证）', () => {
    const types: IocType[] = [
      'ipv4',
      'ipv6',
      'domain',
      'url',
      'md5',
      'sha1',
      'sha256',
      'sha512',
      'email',
      'cve',
    ];
    for (const t of types) {
      const url = buildIntelLink('threatbook', { type: t, value: SAMPLES[t] });
      expect(url).toBeTruthy();
      expect(url).toContain('https://x.threatbook.com/v5/generalSearch?q=');
      expect(url).toContain(encodeURIComponent(SAMPLES[t]));
      // 确保不再出现 file / domain 等细分路由（会 404 的那种）
      expect(url).not.toMatch(/\/file\//);
      expect(url).not.toMatch(/\/domain\//);
      expect(url).not.toMatch(/\/node\//);
      expect(url).not.toMatch(/\/notFound/);
    }
  });

  it('VirusTotal SHA256 跳转正确（V3 URL 格式）', () => {
    const url = buildIntelLink('virustotal', { type: 'sha256', value: SAMPLES.sha256 });
    expect(url).toBe(`https://www.virustotal.com/gui/file/${SAMPLES.sha256}`);
  });

  it('VirusTotal IP 跳转正确', () => {
    const url = buildIntelLink('virustotal', { type: 'ipv4', value: SAMPLES.ipv4 });
    expect(url).toBe(`https://www.virustotal.com/gui/ip-address/${SAMPLES.ipv4}`);
  });

  it('AbuseIPDB 仅支持 IP，对 Email 返回 null（supportedTypes 过滤验证）', () => {
    expect(buildIntelLink('abuseipdb', { type: 'ipv4', value: SAMPLES.ipv4 })).toBeTruthy();
    expect(buildIntelLink('abuseipdb', { type: 'email', value: SAMPLES.email })).toBeNull();
  });

  it('getIntelSource / getIntelSourcesByType 基础', () => {
    const vt = getIntelSource('virustotal');
    expect(vt).toBeTruthy();
    expect(vt!.id).toBe('virustotal');

    const ipSources = getIntelSourcesByType('ipv4').map((s) => s.id);
    expect(ipSources).toContain('virustotal');
    expect(ipSources).toContain('threatbook');
    expect(ipSources).toContain('abuseipdb');
  });

  it('INTEL_SOURCES 共 10 家（已删 bazaar / joesandbox / intezer / virusshare）', () => {
    expect(INTEL_SOURCES.length).toBe(10);
    const ids = INTEL_SOURCES.map((s) => s.id as IntelSourceType);
    expect(ids).not.toContain('bazaar' as IntelSourceType);
    expect(ids).not.toContain('joesandbox' as IntelSourceType);
    expect(ids).not.toContain('intezer' as IntelSourceType);
    expect(ids).not.toContain('virusshare' as IntelSourceType);
  });

  it('buildAllIntelLinks 返回所有支持该类型且成功构建 URL 的源', () => {
    const out = buildAllIntelLinks({ type: 'sha256', value: SAMPLES.sha256 });
    expect(out.length).toBeGreaterThanOrEqual(6);
    expect(out.map((o) => o.source)).toContain('virustotal');
    expect(out.map((o) => o.source)).toContain('threatbook');
    out.forEach((o) => {
      expect(o.url.startsWith('http')).toBe(true);
    });
  });
});
