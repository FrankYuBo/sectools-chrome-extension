import { describe, it, expect } from 'vitest';
import {
  base64Encode,
  base64Decode,
  base32Encode,
  base32Decode,
  urlEncode,
  urlDecode,
  hexEncode,
  hexDecode,
  unicodeEscapeEncode,
  unicodeEscapeDecode,
  htmlEntityEncode,
  htmlEntityDecode,
  multiLayerDecode,
} from '../utils/encode-decode';

describe('encode-decode — 基础编解码', () => {
  it('base64 编解码对称', () => {
    const raw = 'SecTools is awesome';
    const enc = base64Encode(raw);
    expect(enc.success).toBe(true);
    expect(enc.data).toBe('U2VjVG9vbHMgaXMgYXdlc29tZQ==');
    const dec = base64Decode(enc.data!);
    expect(dec.success).toBe(true);
    expect(dec.data).toBe(raw);
  });

  it('url encode / decode 空格和中文', () => {
    expect(urlEncode('a=1&b=张三').data).toBe('a%3D1%26b%3D%E5%BC%A0%E4%B8%89');
    expect(urlDecode('a%3D1%26b%3D%E5%BC%A0%E4%B8%89').data).toBe('a=1&b=张三');
  });

  it('hex encode / decode 基本', () => {
    expect(hexEncode('Hi!').data).toBe('486921');
    expect(hexDecode('486921').data).toBe('Hi!');
  });

  it('unicode 转义', () => {
    expect(unicodeEscapeEncode('中').data).toBe('\\u4e2d');
    expect(unicodeEscapeDecode('\\u4e2d').data).toBe('中');
  });

  it('html entity', () => {
    expect(htmlEntityEncode('<script>').data).toBe('&lt;script&gt;');
    expect(htmlEntityDecode('&lt;script&gt;').data).toBe('<script>');
  });

  it('base32 编解码 Hello', () => {
    // RFC 4648 标准用例
    const enc = base32Encode('Hello!');
    expect(enc.success).toBe(true);
    const dec = base32Decode(enc.data!);
    expect(dec.data).toBe('Hello!');
  });
});

describe('encode-decode — 多层自动解码 multiLayerDecode', () => {
  it('URL + Base64 双层解码（layers 非空，最末层 result 为明文）', () => {
    // "Hello World" → base64 → URL encode
    const payload = encodeURIComponent('SGVsbG8gV29ybGQ=');
    const res = multiLayerDecode(payload, 10);
    expect(res.success).toBe(true);
    expect(res.data!.layers.length).toBeGreaterThanOrEqual(2);
    const finalLayer = res.data!.layers[res.data!.layers.length - 1];
    expect(finalLayer.result).toBe('Hello World');
  });

  it('无效 base64 输入应失败而非抛错', () => {
    const bad = base64Decode('@@@@@@@not-valid-base64!!!');
    expect(bad.success).toBe(false);
    expect(bad.error).toBeTruthy();
  });
});
