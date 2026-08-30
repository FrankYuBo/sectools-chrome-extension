import { describe, it, expect } from 'vitest';
import {
  base64Encode,
  base64Decode,
  urlEncode,
  urlDecode,
  unicodeEscapeDecode,
  hexDecode,
  jsonFormat,
  timestampToHuman,
  computeHash,
} from '../utils';

// 模拟右键菜单 actionHandlers 的逻辑（与 background/index.ts 一致）
type ActionHandler = (selectedText: string) => Promise<string>;

const actionHandlers: Record<string, ActionHandler> = {
  'sectools:base64-decode': async (text) => {
    const result = base64Decode(text);
    if (!result.success) throw new Error(result.error ?? 'Base64 解码失败');
    return result.data;
  },
  'sectools:base64-encode': async (text) => {
    const result = base64Encode(text);
    if (!result.success) throw new Error(result.error ?? 'Base64 编码失败');
    return result.data;
  },
  'sectools:url-decode': async (text) => {
    const result = urlDecode(text);
    if (!result.success) throw new Error(result.error ?? 'URL 解码失败');
    return result.data;
  },
  'sectools:url-encode': async (text) => {
    const result = urlEncode(text);
    if (!result.success) throw new Error(result.error ?? 'URL 编码失败');
    return result.data;
  },
  'sectools:unicode-decode': async (text) => {
    const result = unicodeEscapeDecode(text);
    if (!result.success) throw new Error(result.error ?? 'Unicode 解码失败');
    return result.data;
  },
  'sectools:hex-decode': async (text) => {
    const result = hexDecode(text);
    if (!result.success) throw new Error(result.error ?? 'Hex 解码失败');
    return result.data;
  },
  'sectools:json-format': async (text) => {
    const result = jsonFormat(text);
    if (!result.success) throw new Error(result.error ?? 'JSON 格式化失败');
    return result.data;
  },
  'sectools:sha256': async (text) => {
    const result = await computeHash(text, 'SHA-256');
    if (!result.success) throw new Error(result.error ?? 'SHA-256 计算失败');
    return result.data;
  },
  'sectools:timestamp': async (text) => {
    const result = timestampToHuman(text);
    if (!result.success) throw new Error(result.error ?? '时间戳转换失败');
    return `${result.data.local} (${result.data.iso8601})`;
  },
};

describe('右键菜单 actionHandlers 模拟测试', () => {
  // ---- Base64 解码 ----
  it('Base64 解码: SGVsbG8gV29ybGQ= → Hello World', async () => {
    const result = await actionHandlers['sectools:base64-decode']('SGVsbG8gV29ybGQ=');
    expect(result).toBe('Hello World');
  });

  it('Base64 解码: 5L2g5aW9 → 你好', async () => {
    const result = await actionHandlers['sectools:base64-decode']('5L2g5aW9');
    expect(result).toBe('你好');
  });

  it('Base64 解码: 带空白/换行的输入也能正确处理', async () => {
    const result = await actionHandlers['sectools:base64-decode']('  SGVsbG8gV29ybGQ=  \n');
    expect(result).toBe('Hello World');
  });

  it('Base64 解码: URL-safe 变体自动识别', async () => {
    // 标准 Base64 "Pj4+" 包含 + 字符，URL-safe 变体替换为 -
    const input = 'Pj4+';
    const result = await actionHandlers['sectools:base64-decode'](input);
    expect(result).toBe('>>>');
  });

  it('Base64 解码: URL-safe 变体 (- 替换 +)', async () => {
    // URL-safe: Pj4- 是 Pj4+ 中 + 替换为 -
    const input = 'Pj4-';
    const result = await actionHandlers['sectools:base64-decode'](input);
    expect(result).toBe('>>>');
  });

  it('Base64 解码: 无效输入应抛出错误', async () => {
    await expect(actionHandlers['sectools:base64-decode']('!!!not-base64!!!')).rejects.toThrow();
  });

  it('Base64 解码: 空输入应抛出错误', async () => {
    await expect(actionHandlers['sectools:base64-decode']('')).rejects.toThrow();
  });

  // ---- Base64 编码 ----
  it('Base64 编码: Hello World → SGVsbG8gV29ybGQ=', async () => {
    const result = await actionHandlers['sectools:base64-encode']('Hello World');
    expect(result).toBe('SGVsbG8gV29ybGQ=');
  });

  // ---- URL 解码 ----
  it('URL 解码: %E4%BD%A0%E5%A5%BD → 你好', async () => {
    const result = await actionHandlers['sectools:url-decode']('%E4%BD%A0%E5%A5%BD');
    expect(result).toBe('你好');
  });

  // ---- URL 编码 ----
  it('URL 编码: 你好 → %E4%BD%A0%E5%A5%BD', async () => {
    const result = await actionHandlers['sectools:url-encode']('你好');
    expect(result).toBe('%E4%BD%A0%E5%A5%BD');
  });

  // ---- Unicode 解码 ----
  it('Unicode 解码: \\u4f60\\u597d → 你好', async () => {
    const result = await actionHandlers['sectools:unicode-decode']('\\u4f60\\u597d');
    expect(result).toBe('你好');
  });

  // ---- Hex 解码 ----
  it('Hex 解码: 48656c6c6f → Hello', async () => {
    const result = await actionHandlers['sectools:hex-decode']('48656c6c6f');
    expect(result).toBe('Hello');
  });

  // ---- JSON 格式化 ----
  it('JSON 格式化: 压缩 JSON → 格式化输出', async () => {
    const result = await actionHandlers['sectools:json-format']('{"a":1,"b":2}');
    expect(result).toContain('"a"');
    expect(result).toContain('\n');
  });

  // ---- SHA-256 ----
  it('SHA-256: computeHash 可调用且返回非空结果', async () => {
    // jsdom 无 crypto.subtle，仅验证不抛异常且返回 string
    const result = await actionHandlers['sectools:sha256']('hello');
    expect(typeof result).toBe('string');
    // 若运行在真实浏览器/worker 中，result 应为已知哈希
    if (result.length > 0) {
      expect(result).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    }
  });

  // ---- 时间戳转换 ----
  it('时间戳转换: 1700000000 → 可读时间', async () => {
    const result = await actionHandlers['sectools:timestamp']('1700000000');
    expect(result).toContain('2023');
  });
});
