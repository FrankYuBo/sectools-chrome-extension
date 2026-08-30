// ============================================================
// AI 聊天组件 — 右下角浮动图标 + 可展开对话框
// 支持多轮对话、模型切换、脱敏、可编辑发送
// ============================================================

import { loadSettings, saveSettings, onSettingsChanged } from '../utils/settings';
import { desensitize } from '../utils/desensitize';
import { log, copyLogs } from '../utils/logger';
import type { ChatMessage } from '../types';

// --- 模块状态 ---
const WIDGET_HOST_ID = 'sectools-ai-chat-host';
let widgetShadow: ShadowRoot | null = null;
let widgetHostEl: HTMLElement | null = null;
let isSending = false;
let chatHistory: ChatMessage[] = [];
let currentThemeMode = 'system';
let rawInputText = ''; // 脱敏前的原始文本，用于切换脱敏开关时恢复

// --- DOM refs (在 Shadow Root 内) ---
let chatBody: HTMLDivElement | null = null;
let chatInput: HTMLTextAreaElement | null = null;
let modelInput: HTMLInputElement | null = null;
let modelDatalist: HTMLDataListElement | null = null;
let sendBtn: HTMLButtonElement | null = null;
let desensitizeToggle: HTMLInputElement | null = null;

// ============================================================
// CSS
// ============================================================

function buildCss(isDark: boolean): string {
  const c = {
    bg: isDark ? '#0f172a' : '#ffffff',
    bgSecondary: isDark ? '#1e293b' : '#f8fafc',
    bgHover: isDark ? '#334155' : '#e2e8f0',
    border: isDark ? '#334155' : '#e2e8f0',
    text: isDark ? '#e2e8f0' : '#1e293b',
    textSecondary: isDark ? '#94a3b8' : '#64748b',
    textMuted: isDark ? '#64748b' : '#94a3b8',
    accent: '#2563eb',
    accentHover: '#1d4ed8',
    userBubble: isDark ? '#1e3a5f' : '#dbeafe',
    aiBubble: isDark ? '#1e293b' : '#f1f5f9',
    error: '#ef4444',
    shadow: '0 8px 30px rgba(0,0,0,.25)',
  };
  return `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; padding: 0; }

    /* --- 浮动图标 --- */
    .ai-fab {
      position: fixed !important;
      bottom: 24px; right: 24px;
      width: 48px; height: 48px;
      border-radius: 50%;
      background: ${c.accent};
      color: #fff; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 16px rgba(37,99,235,.4);
      z-index: 2147483645 !important;
      transition: transform .2s, box-shadow .2s;
    }
    .ai-fab:hover { transform: scale(1.08); box-shadow: 0 6px 20px rgba(37,99,235,.5); }
    .ai-fab.hidden { display: none; }

    /* --- 对话框 --- */
    .ai-chat {
      position: fixed !important;
      bottom: 24px; right: 24px;
      width: 440px; height: 560px;
      max-height: calc(100vh - 48px);
      max-width: calc(100vw - 32px);
      background: ${c.bg};
      border: 1px solid ${c.border};
      border-radius: 12px;
      box-shadow: ${c.shadow};
      z-index: 2147483646 !important;
      display: flex; flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px; color: ${c.text};
      overflow: hidden;
      animation: ai-slide-up .2s ease-out;
    }
    @keyframes ai-slide-up {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .ai-chat.hidden { display: none; }

    /* --- Header --- */
    .ai-chat-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid ${c.border};
      background: ${c.bgSecondary};
      flex-shrink: 0;
    }
    .ai-chat-header-left {
      display: flex; align-items: center; gap: 8px;
      min-width: 0;
    }
    .ai-chat-header-left svg { flex-shrink: 0; color: ${c.accent}; }
    .ai-chat-title { font-weight: 600; font-size: 14px; white-space: nowrap; }
    .ai-chat-model-input {
      font-size: 11px; color: ${c.text};
      background: ${c.bgHover}; border: 1px solid ${c.border};
      padding: 2px 6px; border-radius: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      cursor: pointer; outline: none;
      width: 140px;
    }
    .ai-chat-model-input:focus { border-color: ${c.accent}; }
    .ai-chat-close {
      background: none; border: none; cursor: pointer; padding: 4px;
      color: ${c.textSecondary}; border-radius: 4px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .ai-chat-close:hover { background: ${c.bgHover}; color: ${c.text}; }

    /* --- Body (messages) --- */
    .ai-chat-body {
      flex: 1; overflow-y: auto; padding: 16px;
      display: flex; flex-direction: column; gap: 12px;
    }

    .ai-msg {
      max-width: 85%; padding: 10px 14px;
      border-radius: 12px; line-height: 1.6;
      font-size: 13px; word-break: break-word;
      white-space: pre-wrap;
    }
    .ai-msg.user {
      align-self: flex-end;
      background: ${c.userBubble};
      border-bottom-right-radius: 4px;
    }
    .ai-msg.assistant {
      align-self: flex-start;
      background: ${c.aiBubble};
      border-bottom-left-radius: 4px;
      white-space: normal;
    }
    .ai-msg.assistant p { margin: 0 0 6px 0; }
    .ai-msg.assistant p:last-child { margin-bottom: 0; }
    .ai-msg.assistant code {
      background: ${isDark ? '#0f172a' : '#f1f5f9'};
      padding: 1px 4px; border-radius: 3px;
      font-size: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .ai-msg.assistant strong { font-weight: 600; }
    .ai-msg.assistant em { font-style: italic; }
    .ai-msg.assistant a { color: ${c.accent}; }
    /* Markdown 标题 */
    .ai-msg.assistant .md-h1, .ai-msg.assistant .md-h2,
    .ai-msg.assistant .md-h3, .ai-msg.assistant .md-h4 {
      font-weight: 700; margin: 10px 0 4px 0;
    }
    .ai-msg.assistant .md-h1 { font-size: 15px; }
    .ai-msg.assistant .md-h2 { font-size: 14px; }
    .ai-msg.assistant .md-h3 { font-size: 13px; }
    .ai-msg.assistant .md-h4 { font-size: 13px; color: ${c.textSecondary}; }
    .ai-msg.assistant .md-h1:first-child, .ai-msg.assistant .md-h2:first-child,
    .ai-msg.assistant .md-h3:first-child, .ai-msg.assistant .md-h4:first-child { margin-top: 0; }
    /* 列表 */
    .ai-msg.assistant ul, .ai-msg.assistant ol {
      margin: 0 0 6px 0; padding-left: 20px;
    }
    .ai-msg.assistant li { margin: 2px 0; }
    /* 代码块 */
    .ai-msg.assistant pre {
      background: ${isDark ? '#0b1120' : '#f8fafc'};
      border: 1px solid ${c.border};
      padding: 8px 10px; border-radius: 6px;
      margin: 6px 0; overflow-x: auto;
      white-space: pre-wrap; word-break: break-all;
    }
    .ai-msg.assistant pre code {
      background: none; padding: 0; border-radius: 0;
      font-size: 11.5px; line-height: 1.5;
    }
    /* 表格 */
    .ai-msg.assistant table {
      border-collapse: collapse; margin: 6px 0; font-size: 12px;
      width: 100%;
    }
    .ai-msg.assistant th, .ai-msg.assistant td {
      border: 1px solid ${c.border};
      padding: 3px 8px; text-align: left;
    }
    .ai-msg.assistant th { background: ${isDark ? '#1e293b' : '#f1f5f9'}; font-weight: 600; }
    /* 分隔线 / 引用 */
    .ai-msg.assistant hr {
      border: none; border-top: 1px solid ${c.border}; margin: 8px 0;
    }
    .ai-msg.assistant blockquote {
      border-left: 3px solid ${c.accent};
      margin: 4px 0; padding: 2px 0 2px 8px;
      color: ${c.textSecondary};
    }
    .ai-msg.system {
      background: rgba(59, 130, 246, 0.06);
      border: 1px solid rgba(59, 130, 246, 0.15);
      color: #3b82f6;
      font-size: 12px;
      padding: 8px 12px;
      border-radius: 8px;
      text-align: center;
    }
    .ai-msg.error {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .ai-copy-logs {
      font-size: 11px;
      padding: 2px 8px;
      border: 1px solid currentColor;
      border-radius: 4px;
      background: transparent;
      color: inherit;
      cursor: pointer;
      opacity: .8;
      white-space: nowrap;
    }
    .ai-copy-logs:hover { opacity: 1; }
    .ai-msg.error {
      align-self: center;
      color: ${c.error}; font-size: 12px;
      text-align: center;
    }
    .ai-msg.system {
      align-self: center;
      color: ${c.textMuted}; font-size: 11px;
      text-align: center;
    }

    .ai-msg-loading {
      align-self: flex-start;
      color: ${c.textMuted}; font-size: 12px;
      padding: 10px 14px;
      background: ${c.aiBubble}; border-radius: 12px; border-bottom-left-radius: 4px;
    }

    /* --- Footer --- */
    .ai-chat-footer {
      border-top: 1px solid ${c.border};
      padding: 12px 16px;
      flex-shrink: 0;
      display: flex; flex-direction: column; gap: 8px;
    }
    .ai-chat-input {
      width: 100%; min-height: 60px; max-height: 120px;
      resize: vertical;
      background: ${c.bgSecondary};
      border: 1px solid ${c.border};
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 13px; line-height: 1.5;
      color: ${c.text};
      font-family: inherit;
      outline: none;
      transition: border-color .15s;
    }
    .ai-chat-input:focus { border-color: ${c.accent}; }
    .ai-chat-input::placeholder { color: ${c.textMuted}; }

    .ai-chat-actions {
      display: flex; align-items: center; justify-content: space-between;
    }
    .ai-chat-actions-left {
      display: flex; align-items: center; gap: 8px;
    }
    .ai-chat-desensitize-toggle {
      display: flex; align-items: center; gap: 6px;
      font-size: 12px; color: ${c.textSecondary}; cursor: pointer;
      user-select: none; padding: 3px 0;
    }
    /* Chrome 风格拨动开关：圆点在右=开，在左=关（突出轨道） */
    .ai-chat-desensitize-toggle input {
      appearance: none; -webkit-appearance: none;
      width: 36px; height: 14px; border-radius: 7px;
      background: ${isDark ? '#475569' : '#cbd5e1'};
      position: relative; cursor: pointer; margin: 0;
      transition: background .2s ease; outline: none;
      flex-shrink: 0;
    }
    .ai-chat-desensitize-toggle input::before {
      content: ''; position: absolute; top: 50%;
      left: -2px; width: 20px; height: 20px;
      border-radius: 50%; background: #fff;
      box-shadow: 0 1px 3px rgba(0,0,0,.35);
      transform: translateY(-50%);
      transition: left .2s ease;
    }
    .ai-chat-desensitize-toggle input:checked { background: ${c.accent}; }
    .ai-chat-desensitize-toggle input:checked::before { left: calc(100% - 18px); }
    .ai-chat-desensitize-toggle input:focus-visible {
      box-shadow: 0 0 0 3px ${isDark ? 'rgba(37,99,235,.4)' : 'rgba(37,99,235,.25)'};
    }
    .ai-chat-actions-right {
      display: flex; align-items: center; gap: 8px;
    }
    .ai-chat-btn-clear {
      background: none; border: 1px solid ${c.border};
      color: ${c.textSecondary}; padding: 6px 12px;
      border-radius: 6px; font-size: 12px; cursor: pointer;
      transition: background .15s;
    }
    .ai-chat-btn-clear:hover { background: ${c.bgHover}; }
    .ai-chat-btn-send {
      background: ${c.accent}; color: #fff; border: none;
      padding: 6px 16px; border-radius: 6px;
      font-size: 13px; font-weight: 500; cursor: pointer;
      transition: background .15s;
    }
    .ai-chat-btn-send:hover { background: ${c.accentHover}; }
    .ai-chat-btn-send:disabled { opacity: .5; cursor: not-allowed; }
  `;
}

// ============================================================
// Lightweight Markdown → HTML（行内格式 + 代码块 + 列表 + 表格，防 XSS）
// ============================================================

/** 行内格式化：`code`、**bold**、*italic*、[text](url)。输入必须是已转义文本 */
function mdInline(text: string): string {
  const codes: string[] = [];
  // 行内代码先占位（\uE000 为 Unicode 私有区字符，非控制字符，正常文本不会出现）
  let t = text.replace(/`([^`]+)`/g, (_m, c: string) => {
    codes.push(c);
    return `\uE000${codes.length - 1}\uE000`;
  });
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  // 仅允许 http(s) 链接，防 javascript: 等
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  t = t.replace(/\uE000(\d+)\uE000/g, (_m, i: string) => `<code>${codes[Number(i)]}</code>`);
  return t;
}

function splitTableRow(row: string): string[] {
  return row.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function mdToHtml(raw: string): string {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let inCode = false;

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // ``` 代码块开关
    if (trimmed.startsWith('```')) {
      closeList();
      if (inCode) {
        out.push('</code></pre>');
        inCode = false;
      } else {
        out.push('<pre><code>');
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      out.push(esc(line) + '\n');
      continue;
    }

    // 空行
    if (trimmed === '') {
      closeList();
      continue;
    }

    // 分隔线
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      closeList();
      out.push('<hr>');
      continue;
    }

    // 标题 # ~ ######
    const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList();
      const level = Math.min(h[1].length, 4);
      out.push(`<div class="md-h${level}">${mdInline(esc(h[2]))}</div>`);
      continue;
    }

    // 无序列表
    const ul = trimmed.match(/^[-*+]\s+(.*)$/);
    if (ul) {
      if (listType !== 'ul') {
        closeList();
        out.push('<ul>');
        listType = 'ul';
      }
      out.push(`<li>${mdInline(esc(ul[1]))}</li>`);
      continue;
    }

    // 有序列表（1. / 1、 / 1)）
    const ol = trimmed.match(/^(\d+)[.、)]\s+(.*)$/);
    if (ol) {
      if (listType !== 'ol') {
        closeList();
        out.push('<ol>');
        listType = 'ol';
      }
      out.push(`<li>${mdInline(esc(ol[2]))}</li>`);
      continue;
    }

    // 表格：| a | b | 且下一行是 |---|---|
    if (
      trimmed.startsWith('|') &&
      i + 1 < lines.length &&
      lines[i + 1].includes('-') &&
      /^\|?[\s:|-]+\|?$/.test(lines[i + 1].trim())
    ) {
      closeList();
      const header = splitTableRow(trimmed);
      i += 1; // 跳过分隔行
      let rows = '';
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('|')) {
        i += 1;
        const cells = splitTableRow(lines[i].trim());
        rows += `<tr>${cells.map((c) => `<td>${mdInline(esc(c))}</td>`).join('')}</tr>`;
      }
      out.push(
        `<table><thead><tr>${header.map((c) => `<th>${mdInline(esc(c))}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`,
      );
      continue;
    }

    // 引用
    if (trimmed.startsWith('> ')) {
      closeList();
      out.push(`<blockquote>${mdInline(esc(trimmed.slice(2)))}</blockquote>`);
      continue;
    }

    // 普通段落
    closeList();
    out.push(`<p>${mdInline(esc(line))}</p>`);
  }

  closeList();
  if (inCode) out.push('</code></pre>');
  return out.join('');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================================
// 文本提取（带 DOM 父选择器）
// ============================================================

/**
 * 提取 AI 研判文本。
 * 优先使用选区存活时捕获的锚点元素 anchorEl（点击按钮可能已清除选区），
 * 兜底再读 window.getSelection()。
 */
function extractTextForAI(selectedText: string, domSelector: string, anchorEl?: Element | null): string {
  if (!domSelector) {
    log.info('ai-extract', '未配置 DOM 父选择器，使用纯选中文本', { len: selectedText.length });
    return selectedText;
  }
  try {
    let el: Element | null = anchorEl ?? null;
    if (!el) {
      // 兜底：尝试从当前（可能仍存活的）选区推导锚点
      const sel = window.getSelection();
      if (sel && sel.anchorNode) {
        let node: Node | null = sel.anchorNode;
        while (node && node.nodeType !== Node.ELEMENT_NODE) node = node.parentNode;
        el = node as Element | null;
      }
    }
    if (!el) {
      log.warn('ai-extract', '配置了父选择器但无法获取选区锚点元素，回退纯选中文本', { domSelector });
      return selectedText;
    }
    const matched = el.closest(domSelector);
    if (matched) {
      const text = matched.textContent?.trim() ?? '';
      if (text) {
        log.info('ai-extract', '父选择器匹配成功', {
          domSelector,
          selectedLen: selectedText.length,
          extractedLen: text.length,
          matchedTag: matched.tagName,
        });
        return text;
      }
      log.warn('ai-extract', '父选择器匹配到元素但文本为空，回退纯选中文本', { domSelector, matchedTag: matched.tagName });
      return selectedText;
    }
    log.warn('ai-extract', '父选择器未匹配到祖先元素，回退纯选中文本', {
      domSelector,
      anchorTag: el.tagName,
      anchorCls: (el.className || '').toString().slice(0, 100),
    });
    return selectedText;
  } catch (err) {
    log.warn('ai-extract', '父选择器执行异常，回退纯选中文本', { domSelector, err: String(err) });
    return selectedText;
  }
}

// ============================================================
// 脱敏：在输入框即时生效
// ============================================================

/** 根据当前脱敏开关状态，将 rawInputText 处理后填入输入框 */
async function applyDesensitizeToInput(): Promise<void> {
  if (!chatInput) return;
  const s = await loadSettings().catch(() => null);
  const enabled = desensitizeToggle?.checked ?? s?.aiConfig.desensitizeEnabled ?? false;
  if (enabled && s) {
    chatInput.value = desensitize(
      rawInputText,
      s.aiConfig.builtInDesensitizeRules ?? {},
      s.aiConfig.customDesensitizeRules ?? [],
    );
  } else {
    chatInput.value = rawInputText;
  }
}

/** 设置输入框文本并记录原始文本（供脱敏切换时使用） */
function setInputText(raw: string): void {
  rawInputText = raw;
  void applyDesensitizeToInput();
}

// ============================================================
// Widget 生命周期
// ============================================================

function ensureWidgetHost(): ShadowRoot {
  if (widgetShadow) return widgetShadow;
  let host = document.getElementById(WIDGET_HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = WIDGET_HOST_ID;
    (document.body ?? document.documentElement).appendChild(host);
  }
  widgetHostEl = host;
  if (!host.shadowRoot) {
    widgetShadow = host.attachShadow({ mode: 'closed' });
  } else {
    widgetShadow = host.shadowRoot;
  }
  return widgetShadow!;
}

function removeWidgetHost(): void {
  widgetHostEl?.remove();
  widgetHostEl = null;
  widgetShadow = null;
  chatBody = null;
  chatInput = null;
  modelInput = null;
  modelDatalist = null;
  sendBtn = null;
  desensitizeToggle = null;
  rawInputText = '';
}

// ============================================================
// 渲染
// ============================================================

function injectStyles(shadow: ShadowRoot): void {
  const isDark = currentThemeMode === 'dark' ||
    (currentThemeMode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const existing = shadow.querySelector('style');
  if (existing) existing.remove();
  const style = document.createElement('style');
  style.textContent = buildCss(isDark);
  shadow.appendChild(style);
}

function buildFab(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'ai-fab';
  btn.title = 'AI 研判';
  btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M12 5v6"/><circle cx="9" cy="15" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.5" fill="currentColor" stroke="none"/><line x1="9" y1="5" x2="15" y2="5"/><line x1="9" y1="3" x2="9" y2="7"/><line x1="15" y1="3" x2="15" y2="7"/><path d="M8 21v1a1 1 0 001 1h6a1 1 0 001-1v-1"/></svg>';
  btn.addEventListener('click', () => openChatWidget());
  return btn;
}

function buildChatDialog(): HTMLDivElement {
  const dialog = document.createElement('div');
  dialog.className = 'ai-chat hidden';

  // Header
  const header = document.createElement('div');
  header.className = 'ai-chat-header';

  const headerLeft = document.createElement('div');
  headerLeft.className = 'ai-chat-header-left';
  const icon = document.createElement('span');
  icon.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M12 5v6"/><circle cx="9" cy="15" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.5" fill="currentColor" stroke="none"/><line x1="9" y1="5" x2="15" y2="5"/><line x1="9" y1="3" x2="9" y2="7"/><line x1="15" y1="3" x2="15" y2="7"/><path d="M8 21v1a1 1 0 001 1h6a1 1 0 001-1v-1"/></svg>';
  const title = document.createElement('span');
  title.className = 'ai-chat-title';
  title.textContent = 'AI 研判';

  // 模型选择（可输入 + 下拉列表）
  modelDatalist = document.createElement('datalist');
  modelDatalist.id = 'ai-model-list';
  modelInput = document.createElement('input');
  modelInput.className = 'ai-chat-model-input';
  modelInput.setAttribute('list', 'ai-model-list');
  modelInput.title = '选择或输入模型名称';
  modelInput.addEventListener('change', async () => {
    const model = modelInput?.value.trim();
    if (!model) return;
    const s = await loadSettings().catch(() => null);
    if (s) {
      await saveSettings({ ...s, aiConfig: { ...s.aiConfig, model } });
    }
  });

  headerLeft.append(icon, title, modelInput, modelDatalist);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'ai-chat-close';
  closeBtn.title = '收起';
  closeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  closeBtn.addEventListener('click', () => closeChatWidget());

  header.append(headerLeft, closeBtn);

  // Body
  chatBody = document.createElement('div');
  chatBody.className = 'ai-chat-body';

  // Footer
  const footer = document.createElement('div');
  footer.className = 'ai-chat-footer';

  chatInput = document.createElement('textarea');
  chatInput.className = 'ai-chat-input';
  chatInput.placeholder = '输入工单内容或安全告警，Shift+Enter 换行...';
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  });

  const actions = document.createElement('div');
  actions.className = 'ai-chat-actions';

  const actionsLeft = document.createElement('div');
  actionsLeft.className = 'ai-chat-actions-left';
  desensitizeToggle = document.createElement('input');
  desensitizeToggle.type = 'checkbox';
  const desensitizeLabel = document.createElement('label');
  desensitizeLabel.className = 'ai-chat-desensitize-toggle';
  desensitizeLabel.textContent = '脱敏';
  desensitizeLabel.prepend(desensitizeToggle);
  // 切换脱敏：开启→以当前输入为源脱敏；关闭→恢复脱敏前原文（rawInputText）
  desensitizeToggle.addEventListener('change', async () => {
    if (!chatInput) return;
    if (desensitizeToggle?.checked) {
      // 开启：以当前输入框内容为源进行脱敏
      rawInputText = chatInput.value;
      void applyDesensitizeToInput();
    } else {
      // 关闭：恢复脱敏前的原始文本
      chatInput.value = rawInputText;
      log.info('ai-chat', '脱敏已关闭，恢复原始文本', { len: rawInputText.length });
    }
  });
  actionsLeft.appendChild(desensitizeLabel);

  const actionsRight = document.createElement('div');
  actionsRight.className = 'ai-chat-actions-right';
  const clearBtn = document.createElement('button');
  clearBtn.className = 'ai-chat-btn-clear';
  clearBtn.textContent = '清空对话';
  clearBtn.addEventListener('click', () => {
    chatHistory = [];
    renderMessages();
  });
  sendBtn = document.createElement('button');
  sendBtn.className = 'ai-chat-btn-send';
  sendBtn.textContent = '发送';
  sendBtn.addEventListener('click', () => doSend());

  actionsRight.append(clearBtn, sendBtn);
  actions.append(actionsLeft, actionsRight);
  footer.append(chatInput, actions);

  dialog.append(header, chatBody, footer);
  return dialog;
}

// ============================================================
// 消息渲染
// ============================================================

function renderMessages(): void {
  if (!chatBody) return;
  chatBody.textContent = '';

  if (chatHistory.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'ai-msg system';
    hint.textContent = '选中页面文本点击「AI 研判」，或直接输入内容发送';
    chatBody.appendChild(hint);
    return;
  }

  for (const msg of chatHistory) {
    if (msg.role === 'system') continue;
    const el = document.createElement('div');
    el.className = `ai-msg ${msg.role}`;
    if (msg.role === 'assistant') {
      el.innerHTML = mdToHtml(msg.content);
    } else {
      el.textContent = msg.content;
    }
    chatBody.appendChild(el);
  }
  scrollToBottom();
}

function appendMessage(role: 'user' | 'assistant', content: string): void {
  chatHistory.push({ role, content });
  if (!chatBody) return;
  const el = document.createElement('div');
  el.className = `ai-msg ${role}`;
  if (role === 'assistant') {
    el.innerHTML = mdToHtml(content);
  } else {
    el.textContent = content;
  }
  chatBody.appendChild(el);
  scrollToBottom();
}

function appendSystemMsg(text: string): void {
  if (!chatBody) return;
  const el = document.createElement('div');
  el.className = 'ai-msg system';
  el.textContent = text;
  chatBody.appendChild(el);
  scrollToBottom();
}

function appendError(text: string): void {
  if (!chatBody) return;
  log.error('ai-chat', text);
  const el = document.createElement('div');
  el.className = 'ai-msg error';
  const msgSpan = document.createElement('span');
  msgSpan.textContent = text;
  el.appendChild(msgSpan);
  // 复制日志按钮：出错时方便用户导出日志反馈
  const copyBtn = document.createElement('button');
  copyBtn.className = 'ai-copy-logs';
  copyBtn.textContent = '复制日志';
  copyBtn.title = '复制 SecTools 运行日志，用于问题排查';
  copyBtn.onclick = async () => {
    const ok = await copyLogs();
    copyBtn.textContent = ok ? '已复制 ✓' : '复制失败';
    setTimeout(() => { copyBtn.textContent = '复制日志'; }, 2000);
  };
  el.appendChild(copyBtn);
  chatBody.appendChild(el);
  scrollToBottom();
}

function showLoading(): void {
  if (!chatBody) return;
  const el = document.createElement('div');
  el.className = 'ai-msg-loading';
  el.id = 'ai-loading';
  el.textContent = '正在分析...';
  chatBody.appendChild(el);
  scrollToBottom();
}

function hideLoading(): void {
  chatBody?.querySelector('#ai-loading')?.remove();
}

function scrollToBottom(): void {
  requestAnimationFrame(() => {
    if (chatBody) chatBody.scrollTop = chatBody.scrollHeight;
  });
}

// ============================================================
// 发送逻辑（输入框内容已脱敏，直接发送）
// ============================================================

async function doSend(): Promise<void> {
  if (isSending) return;
  const text = chatInput?.value.trim();
  if (!text) return;

  // 清空输入
  if (chatInput) chatInput.value = '';
  rawInputText = '';

  // 添加用户消息（输入框内容已经是脱敏后的）
  appendMessage('user', text);

  // 发送
  isSending = true;
  if (sendBtn) sendBtn.disabled = true;
  showLoading();

  try {
    const settings = await loadSettings();
    const { promptTemplate, mcpServers } = settings.aiConfig;

    // 如果有启用的 MCP 自动调用工具，先显示提示
    const hasAutoCall = mcpServers.some(
      (s) => s.enabled && s.autoCallTools.length > 0,
    );
    if (hasAutoCall) {
      hideLoading();
      const loadingEl = chatBody?.querySelector('#ai-loading');
      if (loadingEl) loadingEl.textContent = '正在调用 MCP 工具查询资产信息...';
      else showLoading();
    }

    log.info('ai-send', '发送 AI 研判请求', {
      textLen: text.length,
      historyCount: chatHistory.length,
      mcpAutoCall: hasAutoCall,
    });

    const resp = await chrome.runtime.sendMessage({
      type: 'sec:ai-analyze',
      messages: chatHistory.filter((m) => m.role !== 'system'),
      promptTemplate,
    }) as {
      ok: boolean;
      data?: string;
      error?: string;
      mcpResults?: Array<{ serverName: string; toolName: string; success: boolean; content: string; duration: number }>;
      enrichSummary?: Array<{ source: string; queried: number; hits: number; skipped?: string }>;
    } | undefined;

    hideLoading();

    if (chrome.runtime.lastError) {
      appendError(`请求失败: ${chrome.runtime.lastError.message}`);
    } else if (resp?.ok && resp.data) {
      log.info('ai-send', 'AI 研判响应成功', { respLen: resp.data.length, mcpCount: resp.mcpResults?.length ?? 0, enrichSources: resp.enrichSummary?.length ?? 0 });
      // 显示 MCP 调用结果摘要
      if (resp.mcpResults && resp.mcpResults.length > 0) {
        const mcpParts: string[] = [];
        for (const r of resp.mcpResults) {
          if (r.success) {
            mcpParts.push(`[MCP] ${r.serverName} / ${r.toolName} (${r.duration}ms)`);
          } else {
            log.warn('ai-send', 'MCP 工具调用失败', r);
          }
        }
        if (mcpParts.length > 0) {
          appendSystemMsg(`🔧 已通过 MCP 查询 ${mcpParts.length} 个工具获取上下文信息`);
        }
      }
      // 显示情报富化摘要（命中源 + 跳过源）
      if (resp.enrichSummary && resp.enrichSummary.length > 0) {
        const hitSources = resp.enrichSummary.filter((s) => s.hits > 0);
        const skipped = resp.enrichSummary.filter((s) => s.skipped);
        if (hitSources.length > 0) {
          appendSystemMsg(`📡 情报富化：${hitSources.map((s) => `${s.source} 命中 ${s.hits}`).join('、')}`);
        }
        for (const s of skipped) {
          log.info('ai-send', `情报源跳过: ${s.source}`, s.skipped);
        }
      }
      appendMessage('assistant', resp.data);
    } else {
      appendError(resp?.error || '未知错误');
    }
  } catch (err) {
    hideLoading();
    appendError(err instanceof Error ? err.message : String(err));
  } finally {
    isSending = false;
    if (sendBtn) sendBtn.disabled = false;
    if (chatInput) chatInput.focus();
  }
}

// ============================================================
// 打开 / 关闭
// ============================================================

async function openChatWidget(initialText?: string): Promise<void> {
  const shadow = ensureWidgetHost();
  injectStyles(shadow);

  // 首次挂载
  if (!shadow.querySelector('.ai-fab')) {
    shadow.appendChild(buildFab());
    shadow.appendChild(buildChatDialog());
  }

  const fab = shadow.querySelector('.ai-fab') as HTMLElement;
  const dialog = shadow.querySelector('.ai-chat') as HTMLElement;
  if (!fab || !dialog) return;

  // 更新模型选择器
  const settings = await loadSettings().catch(() => null);
  if (modelInput && modelDatalist && settings) {
    modelDatalist.textContent = '';
    const models = (settings.aiConfig.modelList?.length ?? 0) > 0
      ? settings.aiConfig.modelList!
      : (settings.aiConfig.model ? [settings.aiConfig.model] : []);
    for (const m of models) {
      const opt = document.createElement('option');
      opt.value = m;
      modelDatalist.appendChild(opt);
    }
    modelInput.value = settings.aiConfig.model || '';
  }

  // 脱敏开关
  if (desensitizeToggle) {
    desensitizeToggle.checked = settings?.aiConfig.desensitizeEnabled ?? false;
  }
  currentThemeMode = settings?.themeMode ?? 'system';

  // 填入初始文本（从选中文本触发时）—— 脱敏在输入框即时生效
  if (initialText && chatInput) {
    setInputText(initialText);
  }

  // 显示对话框，隐藏 FAB
  fab.classList.add('hidden');
  dialog.classList.remove('hidden');

  renderMessages();
  if (chatInput) chatInput.focus();
}

function closeChatWidget(): void {
  const fab = widgetShadow?.querySelector('.ai-fab') as HTMLElement;
  const dialog = widgetShadow?.querySelector('.ai-chat') as HTMLElement;
  if (fab) fab.classList.remove('hidden');
  if (dialog) dialog.classList.add('hidden');
}

// ============================================================
// 外部 API
// ============================================================

/**
 * 初始化 AI 聊天组件（浮动图标 + 对话框）
 */
export function initAiChatWidget(): () => void {
  const shadow = ensureWidgetHost();
  injectStyles(shadow);
  shadow.appendChild(buildFab());
  shadow.appendChild(buildChatDialog());

  const unlisten = onSettingsChanged(async (key) => {
 if (key === 'aiConfig') {
      const s = await loadSettings().catch(() => null);
      if (!s) return;
      // 刷新模型下拉
      if (modelInput && modelDatalist) {
        modelDatalist.textContent = '';
        const models = (s.aiConfig.modelList?.length ?? 0) > 0
          ? s.aiConfig.modelList!
          : (s.aiConfig.model ? [s.aiConfig.model] : []);
        for (const m of models) {
          const opt = document.createElement('option');
          opt.value = m;
          modelDatalist.appendChild(opt);
        }
        modelInput.value = s.aiConfig.model || modelInput.value;
      }
      if (desensitizeToggle) {
        desensitizeToggle.checked = s.aiConfig.desensitizeEnabled ?? false;
      }
    }
    if (key === 'themeMode') {
      const s = await loadSettings().catch(() => null);
      currentThemeMode = s?.themeMode ?? 'system';
      injectStyles(shadow);
    }
  });

  return () => {
    unlisten();
    removeWidgetHost();
  };
}

/**
 * 从选中文本触发 AI 研判
 * @param anchorEl 选区存活时捕获的锚点元素（用于父选择器提取，点击按钮后选区可能已清除）
 */
export async function triggerAiFromSelection(selectedText: string, domSelector: string, _promptTemplate?: string, anchorEl?: Element | null): Promise<void> {
  const settings = await loadSettings();
  const ai = settings.aiConfig;
  if (!ai.baseUrl || !ai.apiKey || !ai.model) {
    throw new Error('请先在「更多配置」中配置 AI 研判（Base URL / API Key / 模型）');
  }
  log.info('ai-trigger', '触发 AI 研判', { selectedLen: selectedText.length, domSelector: domSelector || '(空)', hasAnchor: !!anchorEl });
  const extracted = extractTextForAI(selectedText, domSelector, anchorEl);
  await openChatWidget(extracted);
}

/**
 * 检查当前页面是否在 AI 聊天组件白名单中
 */
export async function shouldShowAiChatWidget(): Promise<boolean> {
  const s = await loadSettings().catch(() => null);
  if (!s) return false;
  const sites = s.aiConfig.chatWidgetSites ?? [];
  if (!sites || sites.length === 0) return true;
  const hostname = location.hostname;
  return sites.some((rule) => {
    const r = rule.trim().toLowerCase();
    if (!r) return false;
    if (r.startsWith('*.')) {
      return hostname === r.slice(2) || hostname.endsWith('.' + r.slice(2));
    }
    return hostname === r;
  });
}
