import { describe, it, expect } from 'vitest';
import { resolveActiveSources, pickIocsForEnrich } from '../background/enrichment';
import { DEFAULT_ENRICHMENT_CONFIG } from '../types';
import type { EnrichmentConfig } from '../types';

describe('enrichment — 免费情报富化', () => {
  it('默认配置：免 Key 源全开，Key 型源因无 Key 被裁切', () => {
    const r = resolveActiveSources(DEFAULT_ENRICHMENT_CONFIG);
    expect(r.urlhaus).toBe(true);
    expect(r.threatfox).toBe(true);
    expect(r.malwareBazaar).toBe(true);
    expect(r.kev).toBe(true);
    expect(r.nvd).toBe(true);
    expect(r.doh).toBe(true);
    expect(r.ipLocale).toBe(true);
    // Key 型源：无 Key → false（裁切），本地实现兜底不受影响
    expect(r.vt).toBe(false);
    expect(r.abuseipdb).toBe(false);
    expect(r.urlscan).toBe(false);
  });

  it('配置 Key 后对应源启用，其余 Key 型源仍裁切', () => {
    const cfg: EnrichmentConfig = { ...DEFAULT_ENRICHMENT_CONFIG, vtApiKey: 'x' };
    const r = resolveActiveSources(cfg);
    expect(r.vt).toBe(true);
    expect(r.abuseipdb).toBe(false);
    expect(r.urlscan).toBe(false);
  });

  it('总开关关闭时所有源全灭', () => {
    const r = resolveActiveSources({ ...DEFAULT_ENRICHMENT_CONFIG, enabled: false });
    expect(Object.values(r).every((v) => !v)).toBe(true);
  });

  it('未配置（undefined）时回退默认配置', () => {
    const r = resolveActiveSources(undefined);
    expect(r.urlhaus).toBe(true);
  });

  it('pickIocsForEnrich：提取 IP/域名/哈希/CVE，排除内网与保留地址', () => {
    const text = [
      'C2 185.174.132.118 与内网 10.10.25.47 通信',
      '域名 malicious-cdn.update-service.net 解析正常，localhost 忽略',
      '样本 sha256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      '漏洞 CVE-2024-3400 已被利用',
    ].join('\n');
    const r = pickIocsForEnrich(text);
    expect(r.ips).toContain('185.174.132.118');
    expect(r.ips).not.toContain('10.10.25.47'); // 内网地址不外查
    expect(r.domains).toContain('malicious-cdn.update-service.net');
    expect(r.hashes).toContain('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(r.cves).toContain('CVE-2024-3400');
  });

  it('pickIocsForEnrich：每类限量 3 条，避免研判过慢', () => {
    const ips = ['1.1.1.1', '2.2.2.2', '3.3.3.3', '4.4.4.4', '5.5.5.5'].join(' ');
    expect(pickIocsForEnrich(ips).ips.length).toBe(3);
  });
});
