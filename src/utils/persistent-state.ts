// ============================================================
// usePersistentState — popup 面板输入持久化 hook
// 关闭 popup 后再次打开，各面板输入/选项自动恢复。
//
// 设计：
// - 所有字段合并存储在 chrome.storage.local 单 key（popupPanelState），
//   避免逐字段 key 膨胀
// - 模块级内存缓存：popup 生命周期内组件二次挂载（tab 切换回来）
//   直接同步命中，零 IO
// - 写入 debounce 400ms 合并，避免逐键写 storage
// - 读取为异步：挂载后 effect 命中缓存再覆盖（毫秒级闪变，可接受）
// ============================================================

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'popupPanelState';
const WRITE_DEBOUNCE_MS = 400;

// --- 模块级缓存与写队列 ---
let cache: Record<string, unknown> = {};
let loaded = false;
let loadPromise: Promise<void> | null = null;
let pendingWrites: Record<string, unknown> = {};
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function ensureLoaded(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const raw = await chrome.storage.local.get(STORAGE_KEY);
      const stored = raw?.[STORAGE_KEY];
      if (stored && typeof stored === 'object') {
        cache = { ...cache, ...(stored as Record<string, unknown>) };
      }
    } catch {
      // storage 不可用则退化为纯内存（本次会话内仍有效）
    }
    loaded = true;
  })();
  return loadPromise;
}

function flushWrites(): void {
  writeTimer = null;
  if (Object.keys(pendingWrites).length === 0) return;
  const delta = pendingWrites;
  pendingWrites = {};
  chrome.storage.local.get(STORAGE_KEY).then((raw) => {
    const current = (raw?.[STORAGE_KEY] && typeof raw[STORAGE_KEY] === 'object')
      ? (raw[STORAGE_KEY] as Record<string, unknown>)
      : {};
    chrome.storage.local.set({ [STORAGE_KEY]: { ...current, ...delta } }).catch(() => undefined);
  }).catch(() => undefined);
}

function scheduleWrite(key: string, value: unknown): void {
  pendingWrites[key] = value;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(flushWrites, WRITE_DEBOUNCE_MS);
}

/** 清空全部面板持久化数据（设置页"恢复默认"类场景可调用） */
export async function clearPersistentPanelState(): Promise<void> {
  cache = {};
  pendingWrites = {};
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * 带 chrome.storage 持久化的 useState。
 * 用法与 useState 一致：const [value, setValue] = usePersistentState('encode.input', '');
 * setter 同时接受新值与函数式更新。
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(initial);

  // 异步恢复：storage 加载完成后覆盖（模块缓存命中时为同步 resolve）
  useEffect(() => {
    let cancelled = false;
    ensureLoaded().then(() => {
      if (cancelled) return;
      const stored = cache[key];
      if (stored !== undefined) {
        setState(stored as T);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const setPersistent = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => {
        const next = typeof value === 'function'
          ? (value as (p: T) => T)(prev)
          : value;
        cache[key] = next;
        scheduleWrite(key, next);
        return next;
      });
    },
    [key],
  );

  return [state, setPersistent];
}
