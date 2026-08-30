// ============================================================
// 轻量日志 — 环形缓冲存储，支持导出/复制，便于排查线上问题
//
// 上下文说明：
// - content script 与 service worker 是两个模块实例，各自维护内存缓冲
// - SW 侧（无 window）额外将条目 debounce 写入 chrome.storage.local
//   （key: sectoolsLogs，环形 500），供 content 侧合并导出
// - exportAllLogs()/copyLogs() 会拉取 SW 侧日志与本地条目按时间合并
// - window.__sectools_logs 系列仅在扩展上下文可用（content isolated
//   world / SW console）；页面主世界（DevTools 默认 top context）不可见，
//   这是 Chrome 扩展安全模型，DevTools 中请切换到 sectools content script
//   context 使用
// ============================================================

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  /** 毫秒时间戳（用于跨上下文合并排序） */
  ts: number;
  time: string;
  level: LogLevel;
  tag: string;
  msg: string;
  detail?: string;
}

const MAX_ENTRIES = 500;
const SW_STORAGE_KEY = 'sectoolsLogs';
const SW_FLUSH_DELAY_MS = 500;
const entries: LogEntry[] = [];

function pad(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

function timestamp(): string {
  const d = new Date();
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

/** 是否运行在 service worker 上下文（无 window，有 chrome.storage） */
function isServiceWorkerContext(): boolean {
  return typeof window === 'undefined' &&
    typeof chrome !== 'undefined' &&
    !!chrome.storage?.local;
}

// --- SW 侧持久化（debounce 批量写） ---
let swFlushTimer: ReturnType<typeof setTimeout> | null = null;
let swPersistedCount = 0;

function scheduleSwPersist(): void {
  if (swFlushTimer) return;
  swFlushTimer = setTimeout(() => {
    swFlushTimer = null;
    try {
      chrome.storage.local.get(SW_STORAGE_KEY).then((raw) => {
        const stored = Array.isArray(raw?.[SW_STORAGE_KEY])
          ? (raw[SW_STORAGE_KEY] as LogEntry[])
          : [];
        // 追加本次新增条目并裁剪至环形上限
        const merged = [...stored, ...entries.slice(swPersistedCount)].slice(-MAX_ENTRIES);
        swPersistedCount = entries.length;
        chrome.storage.local.set({ [SW_STORAGE_KEY]: merged }).catch(() => undefined);
      }).catch(() => undefined);
    } catch {
      // storage 不可用（极端环境）则放弃持久化
    }
  }, SW_FLUSH_DELAY_MS);
}

function push(level: LogLevel, tag: string, msg: string, detail?: unknown): void {
  let detailStr: string | undefined;
  if (detail !== undefined) {
    if (typeof detail === 'string') {
      detailStr = detail.length > 2000 ? detail.slice(0, 2000) + '…(截断)' : detail;
    } else {
      try {
        detailStr = JSON.stringify(detail, null, 0)?.slice(0, 2000);
      } catch {
        detailStr = String(detail);
      }
    }
  }
  entries.push({ ts: Date.now(), time: timestamp(), level, tag, msg, detail: detailStr });
  if (entries.length > MAX_ENTRIES) entries.shift();

  // 同步输出到控制台（保留 console 便于 DevTools 排查）
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(`[SecTools:${tag}] ${msg}${detailStr ? ' | ' + detailStr : ''}`);

  if (isServiceWorkerContext()) scheduleSwPersist();
}

export const log = {
  info: (tag: string, msg: string, detail?: unknown) => push('info', tag, msg, detail),
  warn: (tag: string, msg: string, detail?: unknown) => push('warn', tag, msg, detail),
  error: (tag: string, msg: string, detail?: unknown) => push('error', tag, msg, detail),
};

/** 读取 SW 侧持久化日志（任意上下文可调，经消息转发亦可） */
export async function getSwLogs(): Promise<LogEntry[]> {
  try {
    const raw = await chrome.storage.local.get(SW_STORAGE_KEY);
    return Array.isArray(raw?.[SW_STORAGE_KEY]) ? (raw[SW_STORAGE_KEY] as LogEntry[]) : [];
  } catch {
    return [];
  }
}

function renderEntries(list: LogEntry[]): string {
  if (list.length === 0) return '(暂无日志)';
  return list
    .map((e) => `[${e.time}][${e.level.toUpperCase()}][${e.tag}] ${e.msg}${e.detail ? '\n    ↳ ' + e.detail.replace(/\n/g, '\n    ') : ''}`)
    .join('\n');
}

/** 导出当前上下文日志为可读文本（仅本地条目） */
export function exportLogs(): string {
  const header = `===== SecTools 日志（本上下文 ${entries.length} 条，导出于 ${new Date().toLocaleString()}）=====\n`;
  return header + renderEntries(entries);
}

/** 导出全量日志（合并 SW 持久化日志，按时间排序），用于复制反馈 */
export async function exportAllLogs(): Promise<string> {
  let swLogs: LogEntry[] = [];
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'sec:logs-export' }) as
        | { ok: boolean; data?: LogEntry[] } | undefined;
      if (resp?.ok && Array.isArray(resp.data)) swLogs = resp.data;
    } catch {
      // SW 不可达（如独立设置页）时降级仅本地
    }
  }
  // 以 (tag,msg,ts) 近似去重：SW 日志与本地重叠仅在同为 SW 上下文时发生
  const localKeys = new Set(entries.map((e) => `${e.ts}|${e.tag}|${e.msg}`));
  const merged = [...entries, ...swLogs.filter((e) => !localKeys.has(`${e.ts}|${e.tag}|${e.msg}`))]
    .sort((a, b) => a.ts - b.ts);
  const header = `===== SecTools 日志（共 ${merged.length} 条，含 SW ${swLogs.length} 条，导出于 ${new Date().toLocaleString()}）=====\n`;
  return header + renderEntries(merged);
}

/** 复制全量日志到剪贴板（合并 SW 日志），返回是否成功 */
export async function copyLogs(): Promise<boolean> {
  const text = await exportAllLogs();
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 兜底：document.execCommand（仅存在 document 的上下文）
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** 清空日志（本地 + SW 持久化） */
export async function clearLogs(): Promise<void> {
  entries.length = 0;
  swPersistedCount = 0;
  try {
    await chrome.storage.local.remove(SW_STORAGE_KEY);
  } catch {
    // ignore
  }
}

// 暴露到当前扩展上下文 globalThis：
// content script → isolated world；SW → SW console。
// 页面主世界不可见（扩展安全模型），DevTools 需切换 context 使用。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;
if (!g.__sectools_logs) {
  g.__sectools_logs = () => {
    console.log(exportLogs());
    return '本上下文日志已打印；调用 __sectools_logs.copy() 复制合并(SW+content)全量日志；__sectools_logs.all() 打印全量';
  };
  g.__sectools_logs.copy = copyLogs;
  g.__sectools_logs.export = exportLogs;
  g.__sectools_logs.all = async () => {
    const t = await exportAllLogs();
    console.log(t);
    return t;
  };
  g.__sectools_logs.clear = clearLogs;
}
