import { describe, it, expect } from 'vitest';
import {
  sanitizeSettingsForExport,
  buildSettingsExport,
  validateSettingsImport,
} from '../utils/settings';
import { DEFAULT_AI_CONFIG, DEFAULT_SETTINGS } from '../types';
import type { AppSettings } from '../types';

const full: Partial<AppSettings> = {
  themeMode: 'dark',
  aiConfig: {
    ...DEFAULT_AI_CONFIG,
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-secret-ai',
    model: 'test-model',
    enrichment: {
      ...DEFAULT_AI_CONFIG.enrichment,
      vtApiKey: 'vt-secret',
      abuseIpdbKey: 'ab-secret',
      urlscanKey: 'us-secret',
    },
    mcpServers: [
      { id: 'mcp-1', name: 'CMDB', url: 'http://localhost:3001/mcp', authToken: 'mcp-secret', enabled: true, autoCallTools: ['query_asset'] },
    ],
  },
};

describe('settings export/import — 配置迁移', () => {
  it('脱敏导出：所有密钥清空，非敏感字段保留', () => {
    const out = sanitizeSettingsForExport(full, false);
    const ai = out.aiConfig!;
    expect(ai.apiKey).toBe('');
    expect(ai.baseUrl).toBe('https://api.example.com/v1'); // 非敏感保留
    expect(ai.model).toBe('test-model');
    expect(ai.enrichment!.vtApiKey).toBe('');
    expect(ai.enrichment!.abuseIpdbKey).toBe('');
    expect(ai.enrichment!.urlscanKey).toBe('');
    expect(ai.mcpServers![0].authToken).toBe('');
    expect(ai.mcpServers![0].url).toBe('http://localhost:3001/mcp'); // 服务器配置保留
  });

  it('全量导出：密钥原样保留（含二次确认的场景）', () => {
    const out = sanitizeSettingsForExport(full, true);
    expect(out.aiConfig!.apiKey).toBe('sk-secret-ai');
    expect(out.aiConfig!.enrichment!.vtApiKey).toBe('vt-secret');
    expect(out.aiConfig!.mcpServers![0].authToken).toBe('mcp-secret');
  });

  it('脱敏不污染原对象（深拷贝）', () => {
    sanitizeSettingsForExport(full, false);
    expect(full.aiConfig!.apiKey).toBe('sk-secret-ai');
  });

  it('导出文件结构：app 标识 + 当前 schema 版本 + 时间戳', () => {
    const f = buildSettingsExport(DEFAULT_SETTINGS, true);
    expect(f.app).toBe('sectools-chrome-extension');
    expect(f.schemaVersion).toBeGreaterThanOrEqual(7);
    expect(f.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('导入校验：合法文件通过，低版本 schemaVersion 允许（走迁移）', () => {
    const raw = JSON.stringify({
      app: 'sectools-chrome-extension',
      schemaVersion: 3,
      exportedAt: '2026-01-01T00:00:00Z',
      settings: { aiConfig: { baseUrl: 'x' } },
    });
    const { error, file } = validateSettingsImport(raw);
    expect(error).toBeNull();
    expect(file!.schemaVersion).toBe(3);
  });

  it('导入校验：非 JSON / 错 app 标识 / 缺 aiConfig 均拒绝', () => {
    expect(validateSettingsImport('not json').error).toContain('JSON');
    expect(validateSettingsImport('{"app":"other"}').error).toContain('app 标识');
    expect(
      validateSettingsImport('{"app":"sectools-chrome-extension","settings":{"foo":1}}').error,
    ).toContain('aiConfig');
  });
});
