import { describe, it, expect, beforeAll } from 'vitest';

// jsdom 环境缺少 crypto.subtle，按需用 Node 的 webcrypto 补齐（ESM 动态导入）
beforeAll(async () => {
  if (!globalThis.crypto?.subtle) {
    const nodeCrypto = await import('node:crypto' as string);
    Object.assign(globalThis, { crypto: nodeCrypto.webcrypto });
  }
});

import {
  analyzeJwtTimeFields,
  checkJwtSecurity,
  signJwtHS,
  forgeJwtNone,
  verifySelfConsistency,
} from '../utils/jwt-tools';
import { jwtDecode } from '../utils/encode-decode';

const NOW = new Date('2026-09-07T12:00:00+08:00').getTime();
const nowSec = Math.floor(NOW / 1000);

describe('jwt-tools — 时间字段解释', () => {
  it('exp 未来 → valid + 相对时间"后"', () => {
    const r = analyzeJwtTimeFields({ exp: nowSec + 3600 }, NOW);
    expect(r.fields.exp?.state).toBe('valid');
    expect(r.fields.exp?.relative).toBe('1 小时后');
    expect(r.overall).toBe('valid');
  });

  it('exp 过去 → expired', () => {
    const r = analyzeJwtTimeFields({ exp: nowSec - 86400 }, NOW);
    expect(r.fields.exp?.state).toBe('expired');
    expect(r.overall).toBe('expired');
  });

  it('nbf 未来 → not-yet-valid', () => {
    const r = analyzeJwtTimeFields({ nbf: nowSec + 60 }, NOW);
    expect(r.fields.nbf?.state).toBe('not-yet-valid');
    expect(r.overall).toBe('not-yet-valid');
  });

  it('毫秒时间戳自动识别（>1e12）与秒一致', () => {
    const sec = analyzeJwtTimeFields({ exp: nowSec + 3600 }, NOW);
    const ms = analyzeJwtTimeFields({ exp: (nowSec + 3600) * 1000 }, NOW);
    expect(ms.fields.exp?.human).toBe(sec.fields.exp?.human);
  });

  it('无时间字段 → overall unknown；iat 不产生状态', () => {
    const r = analyzeJwtTimeFields({ sub: 'x' }, NOW);
    expect(r.overall).toBe('unknown');
    expect(r.fields.iat).toBeUndefined();
  });
});

describe('jwt-tools — 风险检测', () => {
  it('ALG_NONE：alg=none 触发高危', () => {
    const f = checkJwtSecurity({ alg: 'none', typ: 'JWT' }, { sub: 'admin' });
    expect(f[0].code).toBe('ALG_NONE');
    expect(f[0].level).toBe('high');
  });

  it('ALG_NONE：缺失 alg 同样触发', () => {
    const f = checkJwtSecurity({ typ: 'JWT' }, {});
    expect(f.some((x) => x.code === 'ALG_NONE')).toBe(true);
  });

  it('ALG_CONFUSION_HINT：HS256 + kid 触发中危', () => {
    const f = checkJwtSecurity({ alg: 'HS256', kid: 'k1' }, { sub: 'x', exp: nowSec + 3600 });
    const hit = f.find((x) => x.code === 'ALG_CONFUSION_HINT');
    expect(hit?.level).toBe('medium');
  });

  it('RS256 + kid 不触发混淆提示（正常非对称用法）', () => {
    const f = checkJwtSecurity({ alg: 'RS256', kid: 'k1' }, { sub: 'x', exp: nowSec + 3600 });
    expect(f.some((x) => x.code === 'ALG_CONFUSION_HINT')).toBe(false);
  });

  it('SENSITIVE_PAYLOAD：password/phone 触发中危且不回显值', () => {
    const f = checkJwtSecurity({ alg: 'HS256' }, { password: 'P@ss', phone: '13800138000', exp: nowSec + 3600 });
    const hit = f.find((x) => x.code === 'SENSITIVE_PAYLOAD');
    expect(hit?.level).toBe('medium');
    expect(hit!.detail).not.toContain('P@ss');       // 值不回显
    expect(hit!.detail).not.toContain('13800138000');
    expect(hit!.detail).toContain('password');
  });

  it('UNKNOWN_ALG：非白名单算法触发低危', () => {
    const f = checkJwtSecurity({ alg: 'HS128' }, { exp: nowSec + 3600 });
    expect(f.some((x) => x.code === 'UNKNOWN_ALG' && x.level === 'low')).toBe(true);
  });

  it('NO_EXPIRY：无 exp 触发低危', () => {
    const f = checkJwtSecurity({ alg: 'HS256' }, { sub: 'x' });
    expect(f.some((x) => x.code === 'NO_EXPIRY')).toBe(true);
  });

  it('健康 token 无风险项；等级排序 high→low', () => {
    const f = checkJwtSecurity({ alg: 'HS256', typ: 'JWT' }, { sub: 'u', exp: nowSec + 3600 });
    expect(f).toHaveLength(0);
    const mixed = checkJwtSecurity({ alg: 'none' }, { password: 'x' });
    expect(mixed.map((x) => x.level)).toEqual(['high', 'medium', 'low']); // none + 敏感 + 无exp
  });
});

describe('jwt-tools — 签发与伪造', () => {
  it('HS256 签发自校验：token 可被 jwtDecode 解析且签名一致', async () => {
    const payload = { sub: 'test', exp: nowSec + 3600 };
    const r = await signJwtHS(payload, 'my-secret', 'HS256');
    expect(r.success).toBe(true);
    const decoded = jwtDecode(r.data!);
    expect(decoded.success).toBe(true);
    expect(decoded.data.payload.sub).toBe('test');
    expect(await verifySelfConsistency(r.data!, 'my-secret', 'HS256')).toBe(true);
    // 密钥不同 → 签名不一致
    expect(await verifySelfConsistency(r.data!, 'other', 'HS256')).toBe(false);
  });

  it('HS384/HS512 算法正确写入 header', async () => {
    const r512 = await signJwtHS({ a: 1 }, 'k', 'HS512');
    const d = jwtDecode(r512.data!);
    expect(d.data.header.alg).toBe('HS512');
  });

  it('空密钥拒绝签发', async () => {
    const r = await signJwtHS({}, '', 'HS256');
    expect(r.success).toBe(false);
    expect(r.error).toBe('EMPTY_SECRET');
  });

  it('alg=none 伪造：三段且尾部空签名，可被解析', () => {
    const t = forgeJwtNone({ sub: 'admin' });
    expect(t.endsWith('.')).toBe(true);
    expect(t.split('.').length).toBe(3);
    const d = jwtDecode(t);
    expect(d.success).toBe(true);
    expect(d.data.header.alg).toBe('none');
    expect(d.data.payload.sub).toBe('admin');
  });
});
