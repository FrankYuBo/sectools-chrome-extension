// ============================================================
// version-update 模拟单测 — Popup 打开性能回归
// 覆盖：冷却期不发网络请求 / 缓存复用 / forever 忽略 / fetch 超时静默降级
// ============================================================
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkForUpdate } from '../utils/version-update';
import type { UpdateCheckResult } from '../utils/version-update';

// ---------- chrome.storage.local 内存 mock ----------
function createStorageMock() {
  const store = new Map<string, unknown>();
  return {
    local: {
      get: vi.fn(async (key: string) =>
        Object.fromEntries(
          (Array.isArray(key) ? key : [key]).filter((k) => store.has(k)).map((k) => [k, store.get(k)]),
        ),
      ),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.entries(items).forEach(([k, v]) => store.set(k, v));
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        (Array.isArray(keys) ? keys : [keys]).forEach((k) => store.delete(k));
      }),
    },
    __store: store,
  };
}

function setupChrome(storage: ReturnType<typeof createStorageMock>) {
  vi.stubGlobal('chrome', {
    storage: storage,
    runtime: { getManifest: () => ({ version: '0.3.0' }) },
  });
}

function okReleaseResponse(tag: string): Response {
  return {
    ok: true,
    json: async () => ({ tag_name: tag, html_url: 'https://example.com/r' }),
  } as unknown as Response;
}

describe('checkForUpdate 性能与冷却行为', () => {
  let storage: ReturnType<typeof createStorageMock>;

  beforeEach(() => {
    vi.useFakeTimers();
    storage = createStorageMock();
    setupChrome(storage);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('无冷却时发起网络请求并写入结果缓存', async () => {
    const fetchMock = vi.fn(async () => okReleaseResponse('v0.2.0'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkForUpdate();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.hasUpdate).toBe(false); // 0.2.0 < 0.3.0
    expect(storage.__store.get('lastUpdateCheckTime')).toBeTypeOf('number');
    expect(storage.__store.get('lastUpdateCheckResult')).toEqual(
      expect.objectContaining({ hasUpdate: false }),
    );
  });

  it('冷却期内第二次调用不发网络请求，直接复用缓存', async () => {
    const fetchMock = vi.fn(async () => okReleaseResponse('v0.3.1'));
    vi.stubGlobal('fetch', fetchMock);

    const first = await checkForUpdate();
    expect(first.hasUpdate).toBe(true);

    const second = await checkForUpdate();
    expect(fetchMock).toHaveBeenCalledTimes(1); // 冷却期内未再发请求
    expect(second.hasUpdate).toBe(true); // 复用缓存结果
    expect(second.latestVersion).toBe('0.3.1');
  });

  it('冷却期内 forever 忽略该版本 → 缓存结果被压制为无更新', async () => {
    const fetchMock = vi.fn(async () => okReleaseResponse('v0.3.1'));
    vi.stubGlobal('fetch', fetchMock);

    await checkForUpdate();
    // 用户 forever 忽略 0.3.1
    await storage.local.set({ dismissedVersion: '0.3.1', lastDismissType: 'forever' });

    const second = await checkForUpdate();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.hasUpdate).toBe(false);
  });

  it('fetch 挂起超过 3s → abort 静默降级为无更新，不长时间阻塞', async () => {
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const pending = checkForUpdate();
    // 推进 3s 触发 AbortController 超时
    const result: UpdateCheckResult = await vi.advanceTimersByTimeAsync(3000).then(() => pending);
    await pending.catch(() => undefined);

    expect(result.hasUpdate).toBe(false);
    // 超时后也写入冷却，避免冷却期内重复打挂起的 API
    expect(storage.__store.get('lastUpdateCheckTime')).toBeTypeOf('number');
  });

  it('冷却过期后重新发起网络请求', async () => {
    // 预置 2 小时前的检查时间（超过 1h 冷却）
    await storage.local.set({
      lastUpdateCheckTime: Date.now() - 2 * 60 * 60 * 1000,
      lastUpdateCheckResult: { hasUpdate: false, currentVersion: '0.3.0' },
    });
    const fetchMock = vi.fn(async () => okReleaseResponse('v0.2.0'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkForUpdate();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.hasUpdate).toBe(false);
  });
});
