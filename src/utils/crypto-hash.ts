// ============================================================
// 加密哈希模块 — 实现
// 由 .spec/crypto-hash.spec.yaml 驱动
// ============================================================
import type { ToolResult, HashAlgorithm, AESCipherMode } from '../types';

// --- 工具函数 ---

function success<T>(data: T, metadata?: Record<string, string>): ToolResult<T> {
  return { success: true, data, error: null, metadata: metadata ?? null };
}

function fail(error: string): ToolResult<never> {
  return { success: false, data: undefined as never, error, metadata: null };
}

// ================================================================
// MD5 纯 JS 实现 (RFC 1321)
// ================================================================

function md5(message: string): string {
  const bytes = new TextEncoder().encode(message);
  const msgLen = bytes.length;

  // Pre-processing: padding
  const mlBits = msgLen * 8;
  const padLen = ((56 - (msgLen + 1)) % 64 + 64) % 64;

  const padded = new Uint8Array(msgLen + 1 + padLen + 8);
  padded.set(bytes);
  padded[msgLen] = 0x80;

  // Append length in bits (little-endian 64-bit)
  const dataView = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
  // Low 32 bits
  dataView.setUint32(msgLen + 1 + padLen, mlBits & 0xffffffff, true);
  // High 32 bits
  dataView.setUint32(msgLen + 1 + padLen + 4, Math.floor(mlBits / 0x100000000), true);

  // Initialize variables
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  // Sine table
  const S: number[] = [];
  for (let i = 0; i < 64; i++) {
    if (i < 16) {
      S.push(i * 7 + 1); // [1,8,15,22,..,1,8,15,22]
    } else if (i < 32) {
      S.push(((i - 16) * 5 + 5) % 16 + (i < 32 ? 1 : 0));
    }
  }
  // Manual shift amounts per round
  const shifts = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];

  const T: number[] = [];
  for (let i = 0; i < 64; i++) {
    T[i] = Math.floor(0x100000000 * Math.abs(Math.sin(i + 1))) >>> 0;
  }

  // Process each 512-bit block
  const blockCount = padded.length / 64;
  for (let bi = 0; bi < blockCount; bi++) {
    const block = new Uint32Array(
      padded.buffer.slice(
        padded.byteOffset + bi * 64,
        padded.byteOffset + bi * 64 + 64,
      ),
    );

    const X: number[] = [];
    for (let i = 0; i < 16; i++) {
      X[i] = block[i];
    }

    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;

    for (let i = 0; i < 64; i++) {
      let F: number;
      let g: number;

      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }

      F = (F + A + T[i] + X[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + leftRotate(F, shifts[i])) >>> 0;
    }

    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  // Output as hex
  return toHexLE(a0) + toHexLE(b0) + toHexLE(c0) + toHexLE(d0);
}

function leftRotate(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

function toHexLE(n: number): string {
  // Little-endian byte order for MD5 output
  return (
    hexByte(n & 0xff) +
    hexByte((n >> 8) & 0xff) +
    hexByte((n >> 16) & 0xff) +
    hexByte((n >> 24) & 0xff)
  );
}

function hexByte(b: number): string {
  return b.toString(16).padStart(2, '0');
}

// ================================================================
// SHA-1 纯 JS 实现 (RFC 3174)
// ================================================================

function sha1Raw(message: string): string {
  const bytes = new TextEncoder().encode(message);
  const msgLen = bytes.length;
  const mlBits = msgLen * 8;

  const padLen = ((56 - (msgLen + 1)) % 64 + 64) % 64;
  const padded = new Uint8Array(msgLen + 1 + padLen + 8);
  padded.set(bytes);
  padded[msgLen] = 0x80;

  const dv = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
  dv.setUint32(msgLen + 1 + padLen + 4, mlBits & 0xffffffff); // big-endian

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const blockCount = padded.length / 64;
  for (let bi = 0; bi < blockCount; bi++) {
    const w = new Uint32Array(80);
    const blockView = new DataView(
      padded.buffer,
      padded.byteOffset + bi * 64,
      64,
    );
    for (let i = 0; i < 16; i++) {
      w[i] = blockView.getUint32(i * 4);
    }
    for (let i = 16; i < 80; i++) {
      w[i] = leftRotate(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }

      const temp = (leftRotate(a, 5) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = leftRotate(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  return (
    toHexBE(h0) + toHexBE(h1) + toHexBE(h2) + toHexBE(h3) + toHexBE(h4)
  );
}

function toHexBE(n: number): string {
  return (
    hexByte((n >> 24) & 0xff) +
    hexByte((n >> 16) & 0xff) +
    hexByte((n >> 8) & 0xff) +
    hexByte(n & 0xff)
  );
}

// ================================================================
// 文本到 ArrayBuffer
// ================================================================

function textToBuffer(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

function bufferToHex(buffer: BufferSource): string {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ================================================================
// computeHash — 统一哈希接口
// ================================================================

export async function computeHash(
  text: string,
  algorithm: HashAlgorithm,
): Promise<ToolResult<string>> {
  if (!text) return fail('EMPTY_INPUT');

  try {
    switch (algorithm) {
      case 'MD5':
        return success(md5(text));

      case 'SHA-1':
        return success(sha1Raw(text));

      case 'SHA-256':
      case 'SHA-384':
      case 'SHA-512': {
        const buffer = textToBuffer(text);
        const hashBuffer = await crypto.subtle.digest(algorithm, buffer);
        return success(bufferToHex(hashBuffer));
      }

      default:
        return fail('UNSUPPORTED_ALGORITHM');
    }
  } catch (e) {
    return fail('HASH_ERROR: ' + String(e));
  }
}

// ================================================================
// computeHMAC — HMAC 计算
// ================================================================

export async function computeHMAC(
  text: string,
  key: string,
  algorithm: HashAlgorithm,
): Promise<ToolResult<string>> {
  if (!text) return fail('EMPTY_INPUT');
  if (!key) return fail('EMPTY_KEY');

  // HMAC 仅支持 Web Crypto 原生算法
  if (algorithm === 'MD5') return fail('HMAC_MD5_NOT_SUPPORTED');

  try {
    const keyBuffer = textToBuffer(key);
    const textBuffer = textToBuffer(text);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'HMAC', hash: algorithm },
      false,
      ['sign'],
    );

    const signature = await crypto.subtle.sign('HMAC', cryptoKey, textBuffer);
    return success(bufferToHex(signature));
  } catch (e) {
    return fail('HMAC_ERROR: ' + String(e));
  }
}

// ================================================================
// AES 加解密
// ================================================================

function getAesParams(mode: AESCipherMode): AesKeyGenParams & { name: string; iv?: Uint8Array } {
  switch (mode) {
    case 'CBC':
      return { name: 'AES-CBC', length: 256 };
    case 'GCM':
      return { name: 'AES-GCM', length: 256 };
    default:
      throw new Error('UNSUPPORTED_AES_MODE');
  }
}

export async function aesEncrypt(
  text: string,
  key: string,
  mode: AESCipherMode,
  iv?: string,
): Promise<ToolResult<string>> {
  if (!text) return fail('EMPTY_INPUT');
  if (!key) return fail('EMPTY_KEY');

  try {
    const params = getAesParams(mode);

    // 派生 256-bit key: 使用 SHA-256 对输入 key 做哈希得到固定长度密钥
    const keyDerived = await crypto.subtle.digest('SHA-256', textToBuffer(key));

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyDerived,
      { name: params.name, length: params.length },
      false,
      ['encrypt'],
    );

    const data = textToBuffer(text);

    // 生成 IV（如果未提供）
    let ivBuffer: Uint8Array;
    if (iv) {
      // 对提供的 IV 做 hash 取前 12/16 字节
      const ivHash = await crypto.subtle.digest('SHA-256', textToBuffer(iv));
      ivBuffer = new Uint8Array(ivHash as ArrayBuffer).slice(0, mode === 'GCM' ? 12 : 16);
    } else {
      ivBuffer = crypto.getRandomValues(
        new Uint8Array(mode === 'GCM' ? 12 : 16),
      );
    }

    const algorithm: AesGcmParams | AesCbcParams =
      mode === 'GCM'
        ? { name: 'AES-GCM', iv: ivBuffer as BufferSource }
        : { name: 'AES-CBC', iv: ivBuffer as BufferSource };

    const encrypted = await crypto.subtle.encrypt(algorithm, cryptoKey, data);

    // 格式: iv_hex:ciphertext_hex （GCM 模式下 ciphertext 含 auth tag）
    const ivHex = bufferToHex(ivBuffer as BufferSource);
    const ctHex = bufferToHex(encrypted);
    return success(`${ivHex}:${ctHex}`, { mode, ivLength: String(ivBuffer.length) });
  } catch (e) {
    return fail('AES_ENCRYPT_ERROR: ' + String(e));
  }
}

export async function aesDecrypt(
  encryptedText: string,
  key: string,
  mode: AESCipherMode,
  iv?: string,
): Promise<ToolResult<string>> {
  if (!encryptedText) return fail('EMPTY_INPUT');
  if (!key) return fail('EMPTY_KEY');

  try {
    const params = getAesParams(mode);

    const keyDerived = await crypto.subtle.digest('SHA-256', textToBuffer(key));

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyDerived,
      { name: params.name, length: params.length },
      false,
      ['decrypt'],
    );

    // 解析 iv:ct 格式
    const colonIdx = encryptedText.indexOf(':');
    let ivBuffer: Uint8Array;
    let ctBuffer: Uint8Array;

    if (colonIdx === -1 && iv) {
      // 使用了传入的 iv 参数
      const ivHash = await crypto.subtle.digest('SHA-256', textToBuffer(iv));
      ivBuffer = new Uint8Array(ivHash as ArrayBuffer).slice(0, mode === 'GCM' ? 12 : 16);
      ctBuffer = hexToBuffer(encryptedText);
    } else if (colonIdx > 0) {
      // 使用内嵌的 iv
      ivBuffer = hexToBuffer(encryptedText.substring(0, colonIdx));
      const ivLen = mode === 'GCM' ? 12 : 16;
      if (ivBuffer.length !== ivLen) {
        return fail('AES_DECRYPT_ERROR: IV length mismatch, expected ' + ivLen);
      }
      ctBuffer = hexToBuffer(encryptedText.substring(colonIdx + 1));
    } else {
      return fail('AES_DECRYPT_ERROR: Cannot parse IV from ciphertext');
    }

    const algorithm: AesGcmParams | AesCbcParams =
      mode === 'GCM'
        ? { name: 'AES-GCM', iv: ivBuffer as BufferSource }
        : { name: 'AES-CBC', iv: ivBuffer as BufferSource };

    const decrypted = await crypto.subtle.decrypt(algorithm, cryptoKey, ctBuffer as BufferSource);
    const decoder = new TextDecoder();
    return success(decoder.decode(decrypted));
  } catch (e) {
    return fail('AES_DECRYPT_ERROR: ' + String(e));
  }
}

function hexToBuffer(hex: string): Uint8Array {
  const cleaned = hex.replace(/[\s:]/g, '');
  const bytes = new Uint8Array(cleaned.length / 2) as Uint8Array;
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes[i / 2] = parseInt(cleaned.substring(i, i + 2), 16);
  }
  return bytes;
}
