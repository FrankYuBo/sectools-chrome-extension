// ============================================================
// Content Script — 选中文本浮动工具栏
// 功能：
//   1. 选中文本 → 在选区下方弹出 3 个按钮：解码 / 🔍情报查询 / 🔗URL分析 / AI研判
//   2. 「解码」：尝试常见解码（Base64 / URL / Hex / Unicode / HTML / JWT / 多层），面板展示所有结果并可复制
//   3. 「情报查询」：多源威胁情报并行查询（勾选默认从设置读取）
//   4. 「URL分析」：URL 结构拆解 + 同形异义字检测 + 短链还原（仅 URL/域名 可用）
//   5. AI 聊天组件（独立 Shadow DOM，右下角浮动图标 + 对话框）
// ============================================================

import {
  base64Decode,
  base32Decode,
  hexDecode,
  urlDecode,
  unicodeEscapeDecode,
  htmlEntityDecode,
  jwtDecode,
  multiLayerDecode,
  detectIocs,
  INTEL_SOURCES,
  buildIntelLink,
  analyzeUrl,
  analyzeHomoglyph,
  loadSettings,
  onSettingsChanged,
  shouldShowSelectionToolbar,
} from '../utils';
import type {
  AppSettings,
  MultiLayerDecodeResult,
  DecodeLayer,
  IocType,
  IntelSourceType,
} from '../types';
import type { UrlAnalysisResult } from '../utils/url-analyzer';
import type { HomoglyphAnalysisResult } from '../utils/homoglyph';
import { initAiChatWidget, triggerAiFromSelection, shouldShowAiChatWidget } from './chat-widget';

// ============================================================
// 工具：打开新标签、通知
// ============================================================

function openNewTab(url: string): void {
  try {
    chrome.runtime.sendMessage({ type: 'sec:open-tab', url, active: true });
  } catch (e) {
    // fallback：直接 window.open
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

// ============================================================
// Shadow DOM 宿主 + 样式
// ============================================================

// --- 工具函数 ---
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function showToast(shadow: ShadowRoot, message: string): void {
  const host = document.createElement('div');
  host.textContent = message;
  Object.assign(host.style, {
    position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
    background: '#1e293b', color: '#f1f5f9', padding: '8px 16px', borderRadius: '8px',
    fontSize: '13px', zIndex: '2147483647', boxShadow: '0 4px 12px rgba(0,0,0,.2)',
    whiteSpace: 'nowrap',
  });
  shadow.appendChild(host);
  setTimeout(() => host.remove(), 2500);
}

const HOST_ID = 'sectools-selection-bar-host';
const NS = 'st-'; // short prefix to avoid clashes

function ensureHost(): ShadowRoot {
  let host = document.getElementById(HOST_ID) as HTMLDivElement | null;
  if (host && host.shadowRoot) return host.shadowRoot;
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    Object.assign(host.style, {
      all: 'initial',
      position: 'fixed',
      zIndex: '2147483646',
      top: '0',
      left: '0',
      width: '0',
      height: '0',
      pointerEvents: 'none',
    } as CSSStyleDeclaration);
    const target = document.body ?? document.documentElement;
    target.appendChild(host);
  }
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.appendChild(buildStyles());
  shadow.appendChild(buildToolbar());
  shadow.appendChild(buildDecodePanel());
  shadow.appendChild(buildIntelDropdown());
  shadow.appendChild(buildUrlAnalysisPanel());
  return shadow;
}

function buildStyles(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; }

    /* ============ Toolbar ============ */
    .${NS}toolbar {
      position: fixed;
      display: none;
      align-items: center;
      gap: 4px;
      padding: 4px;
      background: #0f172a;
      color: #e2e8f0;
      border: 1px solid #1e293b;
      border-radius: 8px;
      box-shadow: 0 10px 30px rgba(15,23,42,.35), 0 2px 6px rgba(0,0,0,.2);
      pointer-events: auto;
      font-size: 12px;
      user-select: none;
    }
    .${NS}toolbar.visible { display: inline-flex; }

    .${NS}btn {
      appearance: none;
      border: 0;
      background: transparent;
      color: #e2e8f0;
      padding: 5px 10px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 12px;
      line-height: 1.2;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: background .15s ease, color .15s ease;
      white-space: nowrap;
    }
    .${NS}btn:hover { background: #1e293b; color: #fff; }
    .${NS}btn.primary { background: #2563eb; color: #fff; }
    .${NS}btn.primary:hover { background: #1d4ed8; }
    .${NS}btn.vt { background: #394eff; color: #fff; }
    .${NS}btn.vt:hover { background: #2d3fe0; }
    .${NS}btn.tb { background: #f97316; color: #fff; }
    .${NS}btn.tb:hover { background: #ea580c; }
    .${NS}btn svg { width: 12px; height: 12px; display: block; }
    .${NS}sep { width: 1px; height: 18px; background: #334155; margin: 0 2px; }

    /* ============ Decode Panel ============ */
    .${NS}panel {
      position: fixed;
      display: none;
      width: 480px;
      max-width: calc(100vw - 32px);
      max-height: 70vh;
      background: #ffffff;
      color: #0f172a;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      box-shadow: 0 16px 40px rgba(15,23,42,.18), 0 4px 10px rgba(0,0,0,.08);
      pointer-events: auto;
      overflow: hidden;
      font-size: 13px;
    }
    .${NS}panel.visible { display: flex; flex-direction: column; }
    @media (prefers-color-scheme: dark) {
      .${NS}panel { background: #0f172a; color: #e2e8f0; border-color: #1e293b; }
    }

    .${NS}panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      border-bottom: 1px solid #e2e8f0;
      background: #f8fafc;
      flex-shrink: 0;
    }
    @media (prefers-color-scheme: dark) {
      .${NS}panel-header { background: #111827; border-color: #1e293b; }
    }
    .${NS}panel-title {
      font-weight: 600;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .${NS}panel-title .tag {
      font-weight: 500;
      font-size: 11px;
      color: #64748b;
      background: #e2e8f0;
      padding: 1px 6px;
      border-radius: 999px;
    }
    @media (prefers-color-scheme: dark) {
      .${NS}panel-title .tag { color: #cbd5e1; background: #1e293b; }
    }
    .${NS}close {
      appearance: none;
      border: 0;
      background: transparent;
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      color: #64748b;
      line-height: 1;
    }
    .${NS}close:hover { background: #e2e8f0; color: #0f172a; }
    @media (prefers-color-scheme: dark) {
      .${NS}close:hover { background: #1e293b; color: #f1f5f9; }
    }

    .${NS}panel-body {
      padding: 8px 0;
      overflow: auto;
      flex: 1 1 auto;
    }

    .${NS}section {
      padding: 6px 12px;
      border-bottom: 1px solid #f1f5f9;
    }
    .${NS}section:last-child { border-bottom: 0; }
    @media (prefers-color-scheme: dark) {
      .${NS}section { border-color: #1e293b; }
    }

    .${NS}section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 4px;
    }
    .${NS}section-title {
      font-weight: 600;
      font-size: 12px;
      color: #475569;
    }
    @media (prefers-color-scheme: dark) {
      .${NS}section-title { color: #94a3b8; }
    }
    .${NS}copy-btn {
      appearance: none;
      border: 0;
      background: #eff6ff;
      color: #1d4ed8;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
      transition: background .15s ease;
    }
    .${NS}copy-btn:hover { background: #dbeafe; }
    .${NS}copy-btn.copied { background: #dcfce7; color: #15803d; }
    @media (prefers-color-scheme: dark) {
      .${NS}copy-btn { background: #1e3a8a; color: #bfdbfe; }
      .${NS}copy-btn:hover { background: #1e40af; }
      .${NS}copy-btn.copied { background: #14532d; color: #bbf7d0; }
    }

    .${NS}layer-list {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .${NS}layer-item {
      padding: 6px 8px;
      margin-bottom: 4px;
      background: #f8fafc;
      border-radius: 5px;
      border-left: 3px solid #2563eb;
    }
    @media (prefers-color-scheme: dark) {
      .${NS}layer-item { background: #0b1220; border-color: #3b82f6; }
    }
    .${NS}layer-meta {
      font-size: 11px;
      color: #64748b;
      margin-bottom: 3px;
      display: flex;
      gap: 6px;
      align-items: center;
    }
    @media (prefers-color-scheme: dark) {
      .${NS}layer-meta { color: #94a3b8; }
    }
    .${NS}layer-chip {
      font-weight: 600;
      color: #1d4ed8;
      background: #dbeafe;
      padding: 0 6px;
      border-radius: 3px;
      font-size: 10px;
    }
    @media (prefers-color-scheme: dark) {
      .${NS}layer-chip { color: #bfdbfe; background: #1e3a8a; }
    }
    .${NS}result-code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      background: #0b1220;
      color: #e2e8f0;
      padding: 6px 8px;
      border-radius: 4px;
      white-space: pre-wrap;
      word-break: break-all;
      margin: 0;
      line-height: 1.5;
      max-height: 160px;
      overflow: auto;
    }

    .${NS}simple-code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      padding: 6px 8px;
      background: #f1f5f9;
      color: #0f172a;
      border-radius: 4px;
      white-space: pre-wrap;
      word-break: break-all;
      margin: 0;
      line-height: 1.5;
      max-height: 140px;
      overflow: auto;
    }
    @media (prefers-color-scheme: dark) {
      .${NS}simple-code { background: #0b1220; color: #e2e8f0; }
    }

    .${NS}err {
      font-size: 11px;
      color: #b91c1c;
      background: #fef2f2;
      padding: 4px 8px;
      border-radius: 4px;
      margin: 0;
    }
    @media (prefers-color-scheme: dark) {
      .${NS}err { color: #fecaca; background: #450a0a; }
    }

    .${NS}no-hit {
      padding: 16px;
      text-align: center;
      color: #64748b;
      font-size: 12px;
    }
    @media (prefers-color-scheme: dark) {
      .${NS}no-hit { color: #94a3b8; }
    }

    /* ============ Intel Dropdown ============ */
    .${NS}intel-dropdown {
      position: fixed;
      display: none;
      width: 260px;
      max-width: calc(100vw - 32px);
      background: #0f172a;
      color: #e2e8f0;
      border: 1px solid #1e293b;
      border-radius: 10px;
      box-shadow: 0 16px 40px rgba(15,23,42,.35), 0 4px 10px rgba(0,0,0,.2);
      pointer-events: auto;
      overflow: hidden;
      font-size: 12px;
    }
    .${NS}intel-dropdown.visible { display: flex; flex-direction: column; }

    .${NS}intel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      border-bottom: 1px solid #1e293b;
      background: #111827;
      flex-shrink: 0;
    }
    .${NS}intel-title {
      font-weight: 600;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .${NS}intel-body {
      padding: 8px 4px;
      max-height: 320px;
      overflow-y: auto;
      flex: 1 1 auto;
    }
    .${NS}intel-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 6px;
      cursor: pointer;
      transition: background .12s ease;
    }
    .${NS}intel-item:hover { background: #1e293b; }
    .${NS}intel-item input[type="checkbox"] {
      appearance: none;
      width: 14px;
      height: 14px;
      border: 1.5px solid #475569;
      border-radius: 3px;
      background: #0b1220;
      cursor: pointer;
      position: relative;
      flex-shrink: 0;
      margin: 0;
    }
    .${NS}intel-item input[type="checkbox"]:checked {
      background: #2563eb;
      border-color: #2563eb;
    }
    .${NS}intel-item input[type="checkbox"]:checked::after {
      content: '';
      position: absolute;
      top: 1px;
      left: 4px;
      width: 4px;
      height: 8px;
      border: solid #fff;
      border-width: 0 2px 2px 0;
      transform: rotate(45deg);
    }
    .${NS}intel-icon {
      width: 16px;
      height: 16px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      flex-shrink: 0;
    }
    .${NS}intel-name {
      font-size: 12px;
      color: #e2e8f0;
      flex: 1;
    }
    .${NS}intel-item.disabled .${NS}intel-name {
      color: #475569;
      text-decoration: line-through;
    }

    .${NS}intel-footer {
      display: flex;
      gap: 6px;
      padding: 8px 10px;
      border-top: 1px solid #1e293b;
      background: #111827;
      flex-shrink: 0;
    }
    .${NS}intel-action-btn {
      flex: 1;
      appearance: none;
      border: 0;
      padding: 6px 10px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: background .12s ease;
    }
    .${NS}intel-action-btn.primary {
      background: #2563eb;
      color: #fff;
    }
    .${NS}intel-action-btn.primary:hover { background: #1d4ed8; }
    .${NS}intel-action-btn.ghost {
      background: #1e293b;
      color: #cbd5e1;
    }
    .${NS}intel-action-btn.ghost:hover { background: #334155; }

    /* ============ URL Analysis Panel ============ */
    .${NS}url-section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
      flex-wrap: wrap;
      gap: 6px;
    }
    .${NS}url-badge {
      font-size: 10px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 999px;
      line-height: 1.4;
    }
    .${NS}url-badge.critical { background: #fef2f2; color: #b91c1c; }
    .${NS}url-badge.warning { background: #fffbeb; color: #b45309; }
    .${NS}url-badge.info { background: #eff6ff; color: #1d4ed8; }
    .${NS}url-badge.success { background: #f0fdf4; color: #15803d; }
    @media (prefers-color-scheme: dark) {
      .${NS}url-badge.critical { background: #450a0a; color: #fecaca; }
      .${NS}url-badge.warning { background: #422006; color: #fcd34d; }
      .${NS}url-badge.info { background: #1e3a8a; color: #bfdbfe; }
      .${NS}url-badge.success { background: #14532d; color: #bbf7d0; }
    }

    .${NS}kv-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 4px 0;
      font-size: 12px;
    }
    .${NS}kv-key {
      width: 80px;
      flex-shrink: 0;
      color: #64748b;
      font-weight: 500;
    }
    @media (prefers-color-scheme: dark) {
      .${NS}kv-key { color: #94a3b8; }
    }
    .${NS}kv-val {
      flex: 1;
      min-width: 0;
      word-break: break-all;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 11px;
    }
    .${NS}warning-row {
      display: flex;
      gap: 8px;
      padding: 6px 8px;
      margin-bottom: 4px;
      border-radius: 6px;
      font-size: 11px;
      line-height: 1.4;
    }
    .${NS}warning-row.critical { background: #fef2f2; border-left: 3px solid #dc2626; }
    .${NS}warning-row.warning { background: #fffbeb; border-left: 3px solid #d97706; }
    .${NS}warning-row.info { background: #eff6ff; border-left: 3px solid #2563eb; }
    @media (prefers-color-scheme: dark) {
      .${NS}warning-row.critical { background: #450a0a; border-left-color: #ef4444; }
      .${NS}warning-row.warning { background: #422006; border-left-color: #f59e0b; }
      .${NS}warning-row.info { background: #1e3a8a; border-left-color: #3b82f6; }
    }
    .${NS}warning-level {
      font-weight: 700;
      flex-shrink: 0;
      text-transform: uppercase;
      letter-spacing: .03em;
    }
    .${NS}warning-msg { flex: 1; }
    .${NS}warning-loc {
      flex-shrink: 0;
      color: #64748b;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 10px;
    }
    @media (prefers-color-scheme: dark) {
      .${NS}warning-loc { color: #94a3b8; }
    }

    .${NS}homo-char-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 5px 8px;
      margin-bottom: 3px;
      background: #f8fafc;
      border-radius: 5px;
      font-size: 11px;
    }
    @media (prefers-color-scheme: dark) {
      .${NS}homo-char-row { background: #0b1220; }
    }
    .${NS}homo-char {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 14px;
      font-weight: 600;
      width: 28px;
      height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: #fef3c7;
      color: #92400e;
      border-radius: 4px;
      flex-shrink: 0;
    }
    @media (prefers-color-scheme: dark) {
      .${NS}homo-char { background: #422006; color: #fcd34d; }
    }
    .${NS}homo-info { flex: 1; min-width: 0; }
    .${NS}homo-hex {
      font-family: ui-monospace, monospace;
      font-size: 10px;
      color: #64748b;
    }
    @media (prefers-color-scheme: dark) {
      .${NS}homo-hex { color: #94a3b8; }
    }
    .${NS}homo-desc { color: #334155; font-size: 11px; }
    @media (prefers-color-scheme: dark) {
      .${NS}homo-desc { color: #cbd5e1; }
    }
    .${NS}homo-summary-line {
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 5px;
      margin-bottom: 4px;
    }
    .${NS}homo-summary-line.critical { background: #fef2f2; color: #b91c1c; }
    .${NS}homo-summary-line.warning { background: #fffbeb; color: #b45309; }
    .${NS}homo-summary-line.info { background: #eff6ff; color: #1d4ed8; }
    @media (prefers-color-scheme: dark) {
      .${NS}homo-summary-line.critical { background: #450a0a; color: #fecaca; }
      .${NS}homo-summary-line.warning { background: #422006; color: #fcd34d; }
      .${NS}homo-summary-line.info { background: #1e3a8a; color: #bfdbfe; }
    }

    .${NS}unshorten-box {
      padding: 8px 10px;
      margin-bottom: 4px;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 6px;
      font-size: 11px;
    }
    @media (prefers-color-scheme: dark) {
      .${NS}unshorten-box { background: #14532d; border-color: #166534; }
    }
    .${NS}unshorten-box.loading {
      background: #eff6ff;
      border-color: #bfdbfe;
    }
    @media (prefers-color-scheme: dark) {
      .${NS}unshorten-box.loading { background: #1e3a8a; border-color: #1e40af; }
    }
    .${NS}unshorten-label {
      font-weight: 600;
      color: #15803d;
      margin-bottom: 3px;
    }
    @media (prefers-color-scheme: dark) {
      .${NS}unshorten-label { color: #bbf7d0; }
    }
    .${NS}unshorten-box.loading .${NS}unshorten-label { color: #1d4ed8; }
    @media (prefers-color-scheme: dark) {
      .${NS}unshorten-box.loading .${NS}unshorten-label { color: #bfdbfe; }
    }
    .${NS}unshorten-url {
      font-family: ui-monospace, monospace;
      word-break: break-all;
      font-size: 11px;
    }
    .${NS}btn.disabled {
      opacity: 0.4;
      cursor: not-allowed;
      pointer-events: none;
    }

    @keyframes ${NS}fade-in {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .${NS}toolbar.visible, .${NS}panel.visible, .${NS}intel-dropdown.visible {
      animation: ${NS}fade-in .12s ease-out both;
    }

    /* ============ AI Sidebar ============ */
    .ai-sidebar {
      position: fixed; top: 0; right: 0; height: 100vh; width: 400px;
      background: #ffffff; color: #0f172a; border-left: 1px solid #e2e8f0;
      box-shadow: -4px 0 20px rgba(0,0,0,.1); z-index: 2147483647;
      display: flex; flex-direction: column; font-family: inherit;
      font-size: 13px; transition: transform .2s ease;
    }
    .ai-sidebar.collapsed { transform: translateX(100%); }
    @media (prefers-color-scheme: dark) {
      .ai-sidebar { background: #0f172a; color: #e2e8f0; border-color: #1e293b; }
    }
    .ai-sidebar-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px; border-bottom: 1px solid #e2e8f0;
      background: #f8fafc; flex-shrink: 0;
    }
    @media (prefers-color-scheme: dark) {
      .ai-sidebar-header { background: #111827; border-color: #1e293b; }
    }
    .ai-sidebar-title { font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 6px; }
    .ai-sidebar-close { appearance: none; border: 0; background: transparent; cursor: pointer; padding: 4px; border-radius: 4px; color: #64748b; }
    .ai-sidebar-close:hover { background: #e2e8f0; color: #0f172a; }
    @media (prefers-color-scheme: dark) {
      .ai-sidebar-close:hover { background: #1e293b; color: #f1f5f9; }
    }
    .ai-sidebar-body { flex: 1; overflow-y: auto; padding: 12px 16px; }
    .ai-sidebar-footer { display: flex; gap: 8px; padding: 10px 16px; border-top: 1px solid #e2e8f0; flex-shrink: 0; }
    @media (prefers-color-scheme: dark) {
      .ai-sidebar-footer { border-color: #1e293b; }
    }
    .ai-sidebar-btn { flex: 1; appearance: none; border: 0; padding: 7px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; transition: background .12s; }
    .ai-sidebar-btn.primary { background: #2563eb; color: #fff; }
    .ai-sidebar-btn.primary:hover { background: #1d4ed8; }
    .ai-sidebar-btn.ghost { background: #f1f5f9; color: #475569; }
    .ai-sidebar-btn.ghost:hover { background: #e2e8f0; }
    @media (prefers-color-scheme: dark) {
      .ai-sidebar-btn.ghost { background: #1e293b; color: #cbd5e1; }
      .ai-sidebar-btn.ghost:hover { background: #334155; }
    }
    .ai-sidebar-section { margin-bottom: 12px; }
    .ai-sidebar-section-title { font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 6px; text-transform: uppercase; letter-spacing: .03em; }
    @media (prefers-color-scheme: dark) { .ai-sidebar-section-title { color: #94a3b8; } }
    .ai-sidebar-text { font-size: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; max-height: 120px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; line-height: 1.5; cursor: pointer; }
    @media (prefers-color-scheme: dark) { .ai-sidebar-text { background: #0b1220; border-color: #1e293b; } }
    .ai-sidebar-result { font-size: 13px; line-height: 1.7; white-space: pre-wrap; word-break: break-word; }
    .ai-sidebar-result p { margin: 0 0 8px; }
    .ai-sidebar-result strong { font-weight: 600; }
    .ai-sidebar-result code { background: #f1f5f9; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
    @media (prefers-color-scheme: dark) { .ai-sidebar-result code { background: #1e293b; } }
    .ai-sidebar-loading { display: flex; align-items: center; justify-content: center; padding: 40px 0; color: #64748b; font-size: 13px; }
    .ai-sidebar-error { color: #b91c1c; background: #fef2f2; padding: 8px 12px; border-radius: 6px; font-size: 12px; }
    @media (prefers-color-scheme: dark) { .ai-sidebar-error { color: #fecaca; background: #450a0a; } }
    .ai-sidebar-toggle {
      position: fixed; top: 50%; right: 0; transform: translateY(-50%);
      width: 28px; height: 60px; background: #2563eb; color: #fff; border: none;
      border-radius: 8px 0 0 8px; cursor: pointer; display: flex; align-items: center; justify-content: center;
      font-size: 14px; z-index: 2147483646; box-shadow: -2px 0 8px rgba(0,0,0,.15);
      transition: right .2s ease;
    }
    .ai-sidebar-toggle.hidden { right: -28px; }
    .ai-sidebar-toggle svg { width: 14px; height: 14px; }
  `;

  return style;
}

// ============================================================
// 构建 Toolbar 节点
// ============================================================

function buildToolbar(): HTMLDivElement {
  const root = document.createElement('div');
  root.className = `${NS}toolbar`;
  root.setAttribute('role', 'toolbar');
  root.setAttribute('aria-label', 'SecTools 选中文本工具栏');

  const btnDecode = document.createElement('button');
  btnDecode.type = 'button';
  btnDecode.className = `${NS}btn primary`;
  btnDecode.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>' +
    '<span>解码</span>';
  btnDecode.title = '尝试常见解码（多层 / Base64 / URL / Hex / Unicode / HTML / JWT）';

  const sep = document.createElement('div');
  sep.className = `${NS}sep`;

  const btnIntel = document.createElement('button');
  btnIntel.type = 'button';
  btnIntel.className = `${NS}btn`;
  btnIntel.style.background = '#7c3aed';
  btnIntel.style.color = '#fff';
  btnIntel.innerHTML = '<span>🔍</span><span>情报查询</span>';
  btnIntel.title = '多源威胁情报并行查询（勾选默认从设置读取）';

  const btnUrl = document.createElement('button');
  btnUrl.type = 'button';
  btnUrl.className = `${NS}btn disabled`;
  btnUrl.style.background = '#0891b2';
  btnUrl.style.color = '#fff';
  btnUrl.innerHTML = '<span>🔗</span><span>URL分析</span>';
  btnUrl.title = 'URL 结构拆解 + 同形异义字检测 + 短链还原（仅 URL/域名 可用）';
  (btnUrl as unknown as { 'data-st-role': string })['data-st-role'] = 'btn-url-analyze';

  const btnAi = document.createElement('button');
  btnAi.type = 'button';
  btnAi.className = `${NS}btn disabled`;
  btnAi.style.background = '#10b981';
  btnAi.style.color = '#fff';
  btnAi.innerHTML = '<span>🤖</span><span>AI研判</span>';
  btnAi.title = '发送选中文本到 AI 大模型进行安全研判（需在设置中配置）';
  (btnAi as unknown as { 'data-st-role': string })['data-st-role'] = 'btn-ai';

  root.append(btnDecode, sep, btnIntel, btnUrl, btnAi);
  return root;
}

function buildDecodePanel(): HTMLDivElement {
  const panel = document.createElement('div');
  panel.className = `${NS}panel`;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'SecTools 解码结果');

  const header = document.createElement('div');
  header.className = `${NS}panel-header`;

  const title = document.createElement('div');
  title.className = `${NS}panel-title`;
  title.innerHTML = `🧰 解码结果<span class="tag" data-${NS}-role="input-tag"></span>`;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = `${NS}close`;
  closeBtn.setAttribute('aria-label', '关闭');
  closeBtn.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  closeBtn.addEventListener('click', () => hidePanel(panel));

  header.append(title, closeBtn);

  const body = document.createElement('div');
  body.className = `${NS}panel-body`;

  panel.append(header, body);
  return panel;
}

// ============================================================
// 构建 情报查询下拉
// ============================================================

function buildIntelDropdown(): HTMLDivElement {
  const root = document.createElement('div');
  root.className = `${NS}intel-dropdown`;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'SecTools 情报源选择');

  const header = document.createElement('div');
  header.className = `${NS}intel-header`;

  const title = document.createElement('div');
  title.className = `${NS}intel-title`;
  title.innerHTML = '🔍 情报源选择';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = `${NS}close`;
  closeBtn.setAttribute('aria-label', '关闭');
  closeBtn.style.color = '#94a3b8';
  closeBtn.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  closeBtn.addEventListener('click', () => hideIntelDropdown());

  header.append(title, closeBtn);

  const body = document.createElement('div');
  body.className = `${NS}intel-body`;
  body.setAttribute(`data-${NS}-role`, 'intel-body');

  const footer = document.createElement('div');
  footer.className = `${NS}intel-footer`;

  const btnAll = document.createElement('button');
  btnAll.type = 'button';
  btnAll.className = `${NS}intel-action-btn ghost`;
  btnAll.textContent = '全选';
  btnAll.addEventListener('click', () => setIntelCheckboxesAll(true));

  const btnClear = document.createElement('button');
  btnClear.type = 'button';
  btnClear.className = `${NS}intel-action-btn ghost`;
  btnClear.textContent = '清空';
  btnClear.addEventListener('click', () => setIntelCheckboxesAll(false));

  const btnGo = document.createElement('button');
  btnGo.type = 'button';
  btnGo.className = `${NS}intel-action-btn primary`;
  btnGo.textContent = '并行打开';
  btnGo.addEventListener('click', () => openCheckedIntelSources());

  footer.append(btnAll, btnClear, btnGo);

  root.append(header, body, footer);
  return root;
}

// ============================================================
// 构建 URL 分析面板
// ============================================================

function buildUrlAnalysisPanel(): HTMLDivElement {
  const panel = document.createElement('div');
  panel.className = `${NS}panel`;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'SecTools URL 分析');

  const header = document.createElement('div');
  header.className = `${NS}panel-header`;

  const title = document.createElement('div');
  title.className = `${NS}panel-title`;
  title.innerHTML = `🔗 URL 分析<span class="tag" data-${NS}-role="url-input-tag"></span>`;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = `${NS}close`;
  closeBtn.setAttribute('aria-label', '关闭');
  closeBtn.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  closeBtn.addEventListener('click', () => hidePanel(panel));

  header.append(title, closeBtn);

  const body = document.createElement('div');
  body.className = `${NS}panel-body`;
  body.setAttribute(`data-${NS}-role`, 'url-body');

  panel.append(header, body);
  return panel;
}

// ============================================================
// 情报源检测：从选中文字判断 IoC 类型
// ============================================================

function detectSelectionIoc(text: string): { type: IocType; value: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const r = detectIocs(trimmed, { types: undefined, dedup: true, resolveOverlap: true });
  if (r.success && r.data.total > 0) {
    const m = r.data.matches[0];
    return { type: m.type, value: m.value };
  }
  return null;
}

function detectSelectionUrlOrDomain(text: string): { kind: 'url' | 'domain'; value: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const r = detectIocs(trimmed, { types: ['url', 'domain'], dedup: true, resolveOverlap: false });
  if (r.success && r.data.total > 0) {
    const m = r.data.matches[0];
    return { kind: m.type as 'url' | 'domain', value: m.value };
  }
  return null;
}

// ============================================================
// 情报下拉渲染与交互
// ============================================================

const DEFAULT_INTEL_10: IntelSourceType[] = [
  'virustotal',
  'threatbook',
];

let currentIoc: { type: IocType; value: string } | null = null;
let intelCheckedMap: Partial<Record<IntelSourceType, boolean>> = {};

async function populateIntelDropdown(shadow: ShadowRoot, text: string): Promise<void> {
  const ioc = detectSelectionIoc(text);
  currentIoc = ioc;

  const settings = await loadSettings();

  // 展示前 10 个情报源（与 Popup SettingsPanel / IntelPanel 约定一致）
  // 默认勾选兜底：读取 settings.defaultIntelSources；失败再用 DEFAULT_INTEL_10（VT+微步）
  const displaySources = INTEL_SOURCES.slice(0, 10);
  const defaultSrcs: IntelSourceType[] =
    (settings?.defaultIntelSources?.length
      ? settings.defaultIntelSources
      : DEFAULT_INTEL_10) as IntelSourceType[];

  const body = shadow.querySelector<HTMLElement>(`[data-${NS}-role="intel-body"]`);
  if (!body) return;
  body.innerHTML = '';

  if (!ioc) {
    const noHit = document.createElement('div');
    noHit.className = `${NS}no-hit`;
    noHit.style.color = '#94a3b8';
    noHit.style.padding = '20px 12px';
    noHit.textContent = `未识别到 IOC 类型（选中：${previewInput(text)}）`;
    body.appendChild(noHit);
    intelCheckedMap = {};
    return;
  }

  const checked: Partial<Record<IntelSourceType, boolean>> = {};
  for (const src of displaySources) {
    const supported = src.supportedTypes.includes(ioc.type);
    const isDefault = defaultSrcs.includes(src.id);
    checked[src.id] = supported && isDefault;
  }
  intelCheckedMap = checked;

  for (const src of displaySources) {
    const supported = src.supportedTypes.includes(ioc.type);
    const item = document.createElement('label');
    item.className = `${NS}intel-item` + (supported ? '' : ' disabled');
    item.style.color = supported ? '#e2e8f0' : '#475569';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = src.id;
    cb.checked = !!checked[src.id] && supported;
    cb.disabled = !supported;
    cb.addEventListener('change', () => {
      intelCheckedMap[src.id as IntelSourceType] = cb.checked;
    });

    const icon = document.createElement('span');
    icon.className = `${NS}intel-icon`;
    icon.textContent = src.icon ?? '';

    const name = document.createElement('span');
    name.className = `${NS}intel-name`;
    name.textContent = src.name + (supported ? '' : ` · 不支持${iocLabel(ioc.type)}`);

    item.append(cb, icon, name);
    body.appendChild(item);
  }
}

function iocLabel(t: IocType): string {
  const map: Record<IocType, string> = {
    ipv4: 'IPv4', ipv6: 'IPv6', domain: '域名', url: 'URL', email: '邮箱',
    md5: 'MD5', sha1: 'SHA1', sha256: 'SHA256', sha512: 'SHA512',
    cve: 'CVE', as: 'ASN', bitcoin: 'BTC', ethereum: 'ETH', mac: 'MAC',
  };
  return map[t] ?? t;
}

function setIntelCheckboxesAll(val: boolean): void {
  const host = document.getElementById(HOST_ID);
  const sr = host?.shadowRoot;
  if (!sr) return;
  const body = sr.querySelector<HTMLElement>(`[data-${NS}-role="intel-body"]`);
  if (!body) return;
  const inputs = body.querySelectorAll<HTMLInputElement>(`input[type="checkbox"]`);
  for (const cb of inputs) {
    if (cb.disabled) continue;
    cb.checked = val;
    intelCheckedMap[cb.value as IntelSourceType] = val;
  }
}

function openCheckedIntelSources(): void {
  if (!currentIoc) return;
  const host = document.getElementById(HOST_ID);
  const sr = host?.shadowRoot;
  const urls: string[] = [];

  // 遍历所有被勾选的源，不再依赖硬编码的 DEFAULT_INTEL_10
  for (const [srcId, on] of Object.entries(intelCheckedMap)) {
    if (!on) continue;
    const url = buildIntelLink(srcId as IntelSourceType, { type: currentIoc.type, value: currentIoc.value });
    if (url) urls.push(url);
  }
  if (urls.length === 0) {
    try { chrome.runtime.sendMessage({ type: 'sec:notify', title: '情报查询', message: '请至少勾选一个情报源' }); } catch { /* ignore */ }
    return;
  }
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i];
    setTimeout(() => openNewTab(u), i * 120);
  }
  hideIntelDropdown();
  hideToolbarFromRoot();
  if (sr) hidePanel(sr.querySelector<HTMLElement>(`.${NS}panel`));
}

function hideIntelDropdown(): void {
  const host = document.getElementById(HOST_ID);
  const sr = host?.shadowRoot;
  const dd = sr?.querySelector<HTMLElement>(`.${NS}intel-dropdown`);
  dd?.classList.remove('visible');
}

function showIntelDropdown(shadow: ShadowRoot): void {
  const dd = shadow.querySelector<HTMLElement>(`.${NS}intel-dropdown`);
  if (!dd || !currentRect) return;
  dd.classList.add('visible');
  requestAnimationFrame(() => {
    if (currentRect) positionNear(dd, currentRect, 'below');
  });
}

// ============================================================
// URL 分析：组合 url-analyzer + homoglyph + 短链还原
// ============================================================

function getUrlPanelBody(shadow: ShadowRoot): HTMLElement | null {
  return shadow.querySelector<HTMLElement>(`[data-${NS}-role="url-body"]`);
}

function getUrlPanelTag(shadow: ShadowRoot): HTMLElement | null {
  return shadow.querySelector<HTMLElement>(`[data-${NS}-role="url-input-tag"]`);
}

function showUrlPanel(shadow: ShadowRoot): void {
  const panel = shadow.querySelector<HTMLDivElement>(`.${NS}panel`) ?? null;
  if (!panel || !currentRect) return;
  const urlBody = shadow.querySelector<HTMLElement>(`[data-${NS}-role="url-body"]`);
  if (!urlBody) return;
  renderUrlAnalysis(shadow, currentSelection);
  const allPanels = shadow.querySelectorAll<HTMLElement>(`.${NS}panel`);
  const urlPanel = urlBody.closest<HTMLElement>(`.${NS}panel`);
  if (!urlPanel) return;
  for (const p of allPanels) if (p !== urlPanel) p.classList.remove('visible');
  urlPanel.classList.add('visible');
  requestAnimationFrame(() => {
    if (currentRect) positionNear(urlPanel, currentRect, 'below');
  });
}

function renderUrlAnalysis(shadow: ShadowRoot, rawText: string): void {
  const body = getUrlPanelBody(shadow);
  const tag = getUrlPanelTag(shadow);
  if (!body) return;
  const info = detectSelectionUrlOrDomain(rawText);
  if (!info) {
    body.innerHTML = '';
    const noHit = document.createElement('div');
    noHit.className = `${NS}no-hit`;
    noHit.textContent = '未识别到 URL 或 域名';
    body.appendChild(noHit);
    return;
  }
  const target = info.value;
  if (tag) tag.textContent = previewInput(target);
  body.innerHTML = '';

  const unshortenBox = document.createElement('div');
  unshortenBox.className = `${NS}unshorten-box loading`;
  unshortenBox.setAttribute(`data-${NS}-role`, 'unshorten-box');
  unshortenBox.innerHTML = `<div class="${NS}unshorten-label">短链还原中…</div><div class="${NS}unshorten-url">正在解析跳转（${target.length > 60 ? target.slice(0, 57) + '…' : target}）</div>`;
  body.appendChild(unshortenBox);

  const urlR = analyzeUrl(target);
  const homoR = analyzeHomoglyph(target);

  if (info.kind === 'url') {
    try {
      chrome.runtime.sendMessage(
        { type: 'sec:unshorten-url', url: target.startsWith('http') ? target : 'https://' + target, maxHops: 20 },
        (resp: { ok: boolean; data?: { finalUrl: string; totalHops: number; truncated: boolean; hops?: Array<{ url: string; status: number; method: string; location?: string; note?: string }> }; error?: string } | undefined) => {
          renderUnshortenResult(shadow, resp ?? { ok: false, error: 'NO_RESPONSE' }, target);
        },
      );
    } catch (e) {
      renderUnshortenResult(shadow, { ok: false, error: e instanceof Error ? e.message : String(e) }, target);
    }
  } else {
    unshortenBox.classList.remove('loading');
    unshortenBox.innerHTML = `<div class="${NS}unshorten-label">分析目标</div><div class="${NS}unshorten-url">${escapeHtml(target)}（域名，无需短链还原）</div>`;
  }

  renderUrlSections(body, urlR.success ? urlR.data : null, homoR.success ? homoR.data : null);
}

interface UnshortenHopView {
  url: string;
  status: number;
  method: string;
  location?: string;
  note?: string;
}

function renderUnshortenResult(shadow: ShadowRoot, resp: { ok: boolean; data?: { finalUrl: string; totalHops: number; truncated: boolean; hops?: UnshortenHopView[] }; error?: string }, original: string): void {
  const body = getUrlPanelBody(shadow);
  if (!body) return;
  const box = body.querySelector<HTMLElement>(`[data-${NS}-role="unshorten-box"]`);
  if (!box) return;
  box.classList.remove('loading');
  if (resp.ok && resp.data) {
    const d = resp.data;
    // 归一化比较（忽略协议差异与末尾斜杠）：仅协议降级不算"真实跳转"
    const norm = (u: string): string => u.replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
    const changed = d.finalUrl && norm(d.finalUrl) !== norm(original);
    const hops = d.hops ?? [];
    // 是否受阻（有跳转意图但最终地址 ≈ 原始地址，如证书死局）
    const hasRedirectIntent = hops.some((h) => h.location);
    const blocked = !changed && hasRedirectIntent;
    const label = changed
      ? `短链还原 · ${d.totalHops} 跳${d.truncated ? '（截断）' : ''}`
      : blocked
        ? '短链还原 · 跟踪受阻（见下方链路说明）'
        : '短链还原 · 无跳转';
    const copyBtn = makeCopyBtn(d.finalUrl);
    copyBtn.style.marginLeft = '6px';
    box.innerHTML = `<div class="${NS}unshorten-label"${blocked ? ' style="color:#b45309;"' : ''}>${label}</div><div class="${NS}unshorten-url"></div>`;
    const urlEl = box.querySelector<HTMLElement>(`.${NS}unshorten-url`);
    if (urlEl) {
      urlEl.textContent = d.finalUrl;
      urlEl.appendChild(copyBtn);
    }

    // 完整跳转链路（逐跳展示；只要有跳转记录就显示，便于诊断受阻点）
    if (hops.length > 0 && (changed || blocked)) {
      const chain = document.createElement('div');
      chain.style.cssText = 'margin-top:6px;padding-top:6px;border-top:1px dashed #bbf7d0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:1.7;word-break:break-all;';
      const title = document.createElement('div');
      title.style.cssText = 'color:#15803d;font-weight:600;margin-bottom:2px;';
      title.textContent = '⟾ 跳转链路';
      chain.appendChild(title);
      hops.forEach((h, idx) => {
        const row = document.createElement('div');
        const isLast = idx === hops.length - 1;
        const statusColor = h.status >= 200 && h.status < 400 ? '#16a34a' : '#b91c1c';
        row.innerHTML =
          `<span style="color:#64748b;">${idx + 1}.</span> ` +
          `<span style="color:${isLast ? '#15803d' : '#334155'};${isLast ? 'font-weight:600;' : ''}">${escapeHtml(h.url)}</span>` +
          ` <span style="color:${statusColor};">[${h.status}·${h.method}]</span>` +
          (h.location ? `<div style="color:#94a3b8;padding-left:14px;">↳ ${escapeHtml(h.location)}</div>` : '') +
          (h.note ? `<div style="color:#b45309;padding-left:14px;">⚠ ${escapeHtml(h.note)}</div>` : '');
        chain.appendChild(row);
      });
      box.appendChild(chain);
    }

    if (changed) {
      try {
        const urlR2 = analyzeUrl(d.finalUrl);
        const homoR2 = analyzeHomoglyph(d.finalUrl);
        if (urlR2.success || homoR2.success) {
          const sub = document.createElement('div');
          sub.style.marginTop = '6px';
          sub.style.paddingTop = '6px';
          sub.style.borderTop = '1px dashed #bbf7d0';
          renderUrlSections(sub, urlR2.success ? urlR2.data : null, homoR2.success ? homoR2.data : null, true);
          box.appendChild(sub);
        }
      } catch { /* ignore */ }
    }
  } else {
    box.innerHTML = `<div class="${NS}unshorten-label" style="color:#b91c1c;">短链还原失败</div><div class="${NS}unshorten-url">${escapeHtml(resp.error ?? 'UNKNOWN')}</div>`;
  }
}

function renderUrlSections(container: HTMLElement, urlData: UrlAnalysisResult | null, homoData: HomoglyphAnalysisResult | null, compact: boolean = false): void {
  if (urlData) {
    const secBox = document.createElement('div');
    if (!compact) secBox.className = `${NS}section`;

    const head = document.createElement('div');
    head.className = `${NS}url-section-head`;
    const title = document.createElement('div');
    title.className = `${NS}section-title`;
    title.textContent = '🧭 URL 结构拆解';
    head.appendChild(title);
    if (urlData.parsed.protocol) {
      const badge = document.createElement('span');
      badge.className = `${NS}url-badge info`;
      badge.textContent = urlData.parsed.protocol.replace(':', '');
      head.appendChild(badge);
    }
    secBox.appendChild(head);

    const rows: Array<[string, string]> = [];
    if (urlData.parsed.hostname) rows.push(['Hostname', urlData.parsed.hostname]);
    if (urlData.parsed.port) rows.push(['Port', urlData.parsed.port]);
    if (urlData.parsed.pathname && urlData.parsed.pathname !== '/') rows.push(['Path', urlData.parsed.pathname]);
    if (urlData.parsed.search) rows.push(['Query', urlData.parsed.search]);
    if (urlData.parsed.hash) rows.push(['Hash', urlData.parsed.hash]);
    if (urlData.parsed.username || urlData.parsed.password) rows.push(['Auth', `${urlData.parsed.username}:${urlData.parsed.password}`]);

    for (const [k, v] of rows) {
      const row = document.createElement('div');
      row.className = `${NS}kv-row`;
      const key = document.createElement('div');
      key.className = `${NS}kv-key`;
      key.textContent = k;
      const val = document.createElement('div');
      val.className = `${NS}kv-val`;
      val.textContent = v;
      row.append(key, val);
      secBox.appendChild(row);
    }

    if (urlData.parsed.queryParams.length > 0) {
      const paramsTitle = document.createElement('div');
      paramsTitle.style.fontSize = '11px';
      paramsTitle.style.fontWeight = '600';
      paramsTitle.style.color = '#64748b';
      paramsTitle.style.margin = '6px 0 3px';
      paramsTitle.textContent = `Query 参数（${urlData.parsed.queryParams.length}）`;
      secBox.appendChild(paramsTitle);
      for (const p of urlData.parsed.queryParams) {
        const row = document.createElement('div');
        row.className = `${NS}kv-row`;
        const key = document.createElement('div');
        key.className = `${NS}kv-key`;
        key.textContent = p.key;
        const val = document.createElement('div');
        val.className = `${NS}kv-val`;
        val.textContent = p.decodedValue ?? p.value;
        if (p.hints.length > 0) {
          const badges = document.createElement('div');
          badges.style.display = 'flex';
          badges.style.gap = '4px';
          badges.style.flexWrap = 'wrap';
          badges.style.marginTop = '2px';
          for (const h of p.hints.slice(0, 3)) {
            const b = document.createElement('span');
            b.className = `${NS}url-badge ` + (h.confidence === 'high' ? 'warning' : 'info');
            b.textContent = h.type;
            badges.appendChild(b);
          }
          val.appendChild(badges);
        }
        row.append(key, val);
        secBox.appendChild(row);
      }
    }

    if (urlData.securityWarnings.length > 0) {
      const warnTitle = document.createElement('div');
      warnTitle.style.fontSize = '11px';
      warnTitle.style.fontWeight = '600';
      warnTitle.style.color = '#64748b';
      warnTitle.style.margin = '8px 0 4px';
      const critN = urlData.securityWarnings.filter((w) => w.level === 'critical').length;
      const warnN = urlData.securityWarnings.filter((w) => w.level === 'warning').length;
      warnTitle.textContent = `⚠️ 安全警告（${critN > 0 ? critN + ' critical / ' : ''}${warnN} warning）`;
      secBox.appendChild(warnTitle);
      for (const w of urlData.securityWarnings) {
        const row = document.createElement('div');
        row.className = `${NS}warning-row ${w.level}`;
        const lvl = document.createElement('div');
        lvl.className = `${NS}warning-level`;
        lvl.textContent = w.level;
        const msg = document.createElement('div');
        msg.className = `${NS}warning-msg`;
        msg.textContent = w.message;
        row.append(lvl, msg);
        if (w.location) {
          const loc = document.createElement('div');
          loc.className = `${NS}warning-loc`;
          loc.textContent = w.location;
          row.appendChild(loc);
        }
        secBox.appendChild(row);
      }
    }

    container.appendChild(secBox);
  }

  if (homoData) {
    const secBox = document.createElement('div');
    if (!compact) secBox.className = `${NS}section`;

    const head = document.createElement('div');
    head.className = `${NS}url-section-head`;
    const title = document.createElement('div');
    title.className = `${NS}section-title`;
    title.textContent = '👁️ 同形异义字 / 混淆字符';
    head.appendChild(title);
    if (homoData.severity) {
      const badge = document.createElement('span');
      badge.className = `${NS}url-badge ${homoData.severity === 'critical' ? 'critical' : homoData.severity === 'warning' ? 'warning' : (homoData.hasIssue ? 'info' : 'success')}`;
      badge.textContent =
        homoData.severity === 'critical' ? '严重' :
        homoData.severity === 'warning' ? '警告' :
        homoData.hasIssue ? '提示' : '安全';
      head.appendChild(badge);
    }
    secBox.appendChild(head);

    for (const s of homoData.summary) {
      const line = document.createElement('div');
      line.className = `${NS}homo-summary-line ${homoData.severity}`;
      line.textContent = '• ' + s;
      secBox.appendChild(line);
    }

    if (homoData.homoglyphs.length > 0) {
      const sub = document.createElement('div');
      sub.style.marginTop = '4px';
      for (const h of homoData.homoglyphs.slice(0, 20)) {
        const row = document.createElement('div');
        row.className = `${NS}homo-char-row`;
        const chBox = document.createElement('span');
        chBox.className = `${NS}homo-char`;
        chBox.textContent = h.char;
        const info = document.createElement('div');
        info.className = `${NS}homo-info`;
        const hex = document.createElement('div');
        hex.className = `${NS}homo-hex`;
        hex.textContent = `${h.hex}  →  形似「${h.lookalike}」 (${h.lookalikeScript})  位置 ${h.index}`;
        const desc = document.createElement('div');
        desc.className = `${NS}homo-desc`;
        desc.textContent = h.description;
        info.append(hex, desc);
        row.append(chBox, info);
        sub.appendChild(row);
      }
      secBox.appendChild(sub);
    }

    if (homoData.invisibleChars.length > 0) {
      const invTitle = document.createElement('div');
      invTitle.style.fontSize = '11px';
      invTitle.style.fontWeight = '600';
      invTitle.style.color = '#64748b';
      invTitle.style.margin = '6px 0 3px';
      invTitle.textContent = `🕵️ 不可见/控制字符（${homoData.invisibleChars.length}）`;
      secBox.appendChild(invTitle);
      for (const ic of homoData.invisibleChars.slice(0, 10)) {
        const row = document.createElement('div');
        row.className = `${NS}warning-row ${ic.category === 'BIDI' ? 'critical' : 'warning'}`;
        const lvl = document.createElement('div');
        lvl.className = `${NS}warning-level`;
        lvl.textContent = ic.category;
        const msg = document.createElement('div');
        msg.className = `${NS}warning-msg`;
        msg.textContent = ic.description;
        const loc = document.createElement('div');
        loc.className = `${NS}warning-loc`;
        loc.textContent = `${ic.hex} @${ic.index}`;
        row.append(lvl, msg, loc);
        secBox.appendChild(row);
      }
    }

    container.appendChild(secBox);
  }

  if (!urlData && !homoData) {
    const noHit = document.createElement('div');
    noHit.className = `${NS}no-hit`;
    noHit.textContent = 'URL 解析与同形字检测均无有效输出';
    container.appendChild(noHit);
  }
}

function hideToolbarFromRoot(): void {
  const host = document.getElementById(HOST_ID);
  const sr = host?.shadowRoot;
  const tb = sr?.querySelector<HTMLElement>(`.${NS}toolbar`);
  tb?.classList.remove('visible');
}

// ============================================================
// 位置计算
// ============================================================

type Rect = { top: number; left: number; right: number; bottom: number; width: number; height: number };

type EditableSelection = { text: string; rect: Rect; anchorEl?: Element | null };

// 处理 <input> / <textarea> / contenteditable（含 Shadow DOM 内部的）
function tryGetEditableSelection(rootEl: Document | ShadowRoot = document): EditableSelection | null {
  const ae = (rootEl as unknown as { activeElement: Element | null }).activeElement as HTMLElement | null;
  if (ae) {
    const tag = ae.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      const el = ae as HTMLInputElement | HTMLTextAreaElement;
      const start = (el as unknown as { selectionStart: number | null }).selectionStart;
      const end = (el as unknown as { selectionEnd: number | null }).selectionEnd;
      if (typeof start === 'number' && typeof end === 'number' && start !== end) {
        const text = el.value.slice(start, end);
        if (text.trim()) {
          const r = el.getBoundingClientRect();
          return {
            text,
            rect: { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
            anchorEl: ae,
          };
        }
      }
    }
    if (ae.isContentEditable) {
      const sel = (rootEl as unknown as { getSelection?: () => Selection | null }).getSelection?.() ?? window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        const text = sel.toString();
        if (text.trim()) {
          const range = sel.getRangeAt(0);
          let rect = range.getBoundingClientRect();
          if ((!rect.width || !rect.height) && range.getClientRects().length > 0) rect = range.getClientRects()[0];
          if (!rect.width && !rect.height) rect = ae.getBoundingClientRect();
          if (rect.width || rect.height) {
            return {
              text,
              rect: { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
            };
          }
        }
      }
    }
  }
  return null;
}

// 收集文档内所有 open ShadowRoot（包括嵌套的）
function collectShadowRoots(root: Element | DocumentFragment = document.body ?? document.documentElement): ShadowRoot[] {
  const results: ShadowRoot[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      const el = node as Element;
      if (el.shadowRoot) results.push(el.shadowRoot);
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  while (walker.nextNode()) { /* noop，副作用是填充 results */ }
  // 嵌套 scan
  for (let i = 0; i < results.length; i++) {
    const sr = results[i];
    const nested = collectShadowRoots(sr);
    for (const n of nested) if (!results.includes(n)) results.push(n);
  }
  return results;
}

/** 从 Range 的 commonAncestorContainer 向上找到最近的 Element（用于父选择器提取） */
function anchorElementFromRange(range: Range): Element | null {
  let node: Node | null = range.commonAncestorContainer;
  if (node && node.nodeType !== Node.ELEMENT_NODE) node = node.parentNode;
  return (node as Element | null) ?? null;
}

// 同步抓取选中文本 + rect + 锚点元素（事件瞬间调用，避免被页面清掉）
function captureSelectionNow(): { text: string; rect: Rect; anchorEl?: Element | null } | null {
  // 1) document 内 input/textarea/contenteditable
  const docEdit = tryGetEditableSelection(document);
  if (docEdit) return docEdit;

  // 2) window.getSelection（现代 Chrome 支持跨 Shadow DOM）
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
    const text = sel.toString();
    if (text.trim()) {
      const range = sel.getRangeAt(0);
      let rect = range.getBoundingClientRect();
      if ((!rect.width || !rect.height) && range.getClientRects().length > 0) rect = range.getClientRects()[0];
      if (rect.width || rect.height) {
        return {
          text,
          rect: { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
          anchorEl: anchorElementFromRange(range),
        };
      }
    }
  }

  // 3) 兜底：遍历所有 ShadowRoot 逐个查 getSelection + activeElement
  try {
    const allSRs = collectShadowRoots();
    for (const sr of allSRs) {
      const ed = tryGetEditableSelection(sr);
      if (ed) return ed;
      const ssel = (sr as unknown as { getSelection?: () => Selection | null }).getSelection?.();
      if (ssel && ssel.rangeCount > 0 && !ssel.isCollapsed) {
        const text = ssel.toString();
        if (text.trim()) {
          const range = ssel.getRangeAt(0);
          let rect = range.getBoundingClientRect();
          if ((!rect.width || !rect.height) && range.getClientRects().length > 0) rect = range.getClientRects()[0];
          if (rect.width || rect.height) {
            return {
              text,
              rect: { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
              anchorEl: anchorElementFromRange(range),
            };
          }
        }
      }
    }
  } catch { /* ignore */ }

  return null;
}

function getSelectionRect(): Rect | null {
  return captureSelectionNow()?.rect ?? null;
}

function positionNear(el: HTMLElement, rect: Rect, place: 'below' | 'above' = 'below'): void {
  // el 必须已在文档里可见（或者 shadowRoot 中）才能测量尺寸
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const MARGIN = 6;
  const elRect = el.getBoundingClientRect();
  const w = elRect.width;
  const h = elRect.height;

  let top = 0;
  let left = Math.max(MARGIN, rect.left + rect.width / 2 - w / 2);
  // 水平不出屏
  if (left + w > vw - MARGIN) left = vw - MARGIN - w;

  if (place === 'below') {
    top = rect.bottom + MARGIN;
    if (top + h > vh - MARGIN) {
      // 翻到上方
      top = rect.top - MARGIN - h;
      if (top < MARGIN) top = MARGIN;
    }
  } else {
    top = rect.top - MARGIN - h;
    if (top < MARGIN) {
      top = rect.bottom + MARGIN;
      if (top + h > vh - MARGIN) top = vh - MARGIN - h;
    }
  }

  el.style.top = `${top}px`;
  el.style.left = `${left}px`;
}

// ============================================================
// 解码：尝试所有常见方式
// ============================================================

interface SingleDecodeResult {
  name: string;
  label: string;
  success: boolean;
  output?: string;
  error?: string;
}

interface JwtDecodeOutcome {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
}

function runDecodes(input: string): {
  multiLayers: DecodeLayer[];
  singles: SingleDecodeResult[];
  jwt: JwtDecodeOutcome | null;
} {
  const singles: SingleDecodeResult[] = [];
  const trimmed = input.trim();

  // Base64
  {
    const r = base64Decode(trimmed);
    singles.push({
      name: 'base64',
      label: 'Base64',
      success: r.success,
      output: r.success ? r.data : undefined,
      error: r.success ? undefined : r.error ?? undefined,
    });
  }
  // Base32
  {
    const r = base32Decode(trimmed);
    singles.push({
      name: 'base32',
      label: 'Base32',
      success: r.success,
      output: r.success ? r.data : undefined,
      error: r.success ? undefined : r.error ?? undefined,
    });
  }
  // Hex
  {
    const r = hexDecode(trimmed);
    singles.push({
      name: 'hex',
      label: 'Hex',
      success: r.success,
      output: r.success ? r.data : undefined,
      error: r.success ? undefined : r.error ?? undefined,
    });
  }
  // URL
  {
    const r = urlDecode(trimmed);
    singles.push({
      name: 'url',
      label: 'URL',
      success: r.success,
      output: r.success ? r.data : undefined,
      error: r.success ? undefined : r.error ?? undefined,
    });
  }
  // Unicode
  {
    const r = unicodeEscapeDecode(trimmed);
    const changed = r.success && r.data !== trimmed;
    singles.push({
      name: 'unicode',
      label: 'Unicode',
      success: r.success && changed,
      output: r.success && changed ? r.data : undefined,
      error: r.success
        ? changed ? undefined : 'NO_CHANGE'
        : r.error ?? undefined,
    });
  }
  // HTML
  {
    const r = htmlEntityDecode(trimmed);
    const changed = r.success && r.data !== trimmed;
    singles.push({
      name: 'html',
      label: 'HTML Entity',
      success: r.success && changed,
      output: r.success && changed ? r.data : undefined,
      error: r.success
        ? changed ? undefined : 'NO_CHANGE'
        : r.error ?? undefined,
    });
  }

  // JWT
  let jwt: JwtDecodeOutcome | null = null;
  const jwtR = jwtDecode(trimmed);
  if (jwtR.success && jwtR.data) {
    jwt = {
      header: jwtR.data.header ?? {},
      payload: jwtR.data.payload ?? {},
      signature: jwtR.data.signatureRaw ?? '',
    };
  }

  // 多层解码
  let multiLayers: DecodeLayer[] = [];
  const mR = multiLayerDecode(trimmed, 10);
  if (mR.success) {
    multiLayers = (mR.data as MultiLayerDecodeResult).layers ?? [];
  } else if ((mR as unknown as { data: MultiLayerDecodeResult }).data?.layers) {
    multiLayers = ((mR as unknown) as { data: MultiLayerDecodeResult }).data.layers;
  }

  return { multiLayers, singles, jwt };
}

// ============================================================
// 渲染解码面板内容
// ============================================================

function getPanelBody(panel: HTMLElement): HTMLElement {
  return panel.querySelector(`.${NS}panel-body`) as HTMLElement;
}

function getTagEl(panel: HTMLElement): HTMLElement | null {
  return panel.querySelector(`[data-${NS}-role="input-tag"]`);
}

async function copyText(text: string, btn: HTMLButtonElement): Promise<void> {
  const originalLabel = btn.textContent ?? '复制';
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = '已复制';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = originalLabel;
      btn.classList.remove('copied');
    }, 1200);
  } catch {
    // 回退：background + offscreen
    try {
      chrome.runtime.sendMessage({ type: 'sec:notify', title: '复制失败', message: '当前页面剪贴板受限' });
    } catch { /* ignore */ }
  }
}

function makeCopyBtn(text: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `${NS}copy-btn`;
  b.textContent = '复制';
  b.addEventListener('click', () => copyText(text, b));
  return b;
}

function previewInput(input: string): string {
  const t = input.trim().replace(/\s+/g, ' ');
  if (t.length <= 40) return t;
  return `${t.slice(0, 37)}…`;
}

function section(titleText: string, content: Node, copyText?: string): HTMLElement {
  const sec = document.createElement('div');
  sec.className = `${NS}section`;
  const head = document.createElement('div');
  head.className = `${NS}section-head`;
  const title = document.createElement('div');
  title.className = `${NS}section-title`;
  title.textContent = titleText;
  head.appendChild(title);
  if (copyText) head.appendChild(makeCopyBtn(copyText));
  sec.appendChild(head);
  sec.appendChild(content);
  return sec;
}

function emptyResultEl(): HTMLElement {
  const el = document.createElement('div');
  el.className = `${NS}no-hit`;
  el.textContent = '没有检测到可解码格式，已尝试 Base64 / Base32 / Hex / URL / Unicode / HTML / JWT。';
  return el;
}

function renderDecodeResults(panel: HTMLElement, input: string): void {
  const body = getPanelBody(panel);
  body.innerHTML = '';
  const tag = getTagEl(panel);
  if (tag) tag.textContent = previewInput(input);

  const { multiLayers, singles, jwt } = runDecodes(input);

  // 1) 多层解码
  if (multiLayers.length > 0) {
    const list = document.createElement('ol');
    list.className = `${NS}layer-list`;
    for (const layer of multiLayers) {
      const li = document.createElement('li');
      li.className = `${NS}layer-item`;
      const meta = document.createElement('div');
      meta.className = `${NS}layer-meta`;
      meta.innerHTML = `<span>第 ${layer.layer} 层</span><span class="${NS}layer-chip">${layer.detected}</span>`;
      const copyBtn = makeCopyBtn(layer.result);
      copyBtn.style.marginLeft = 'auto';
      meta.appendChild(copyBtn);
      const code = document.createElement('pre');
      code.className = `${NS}result-code`;
      code.textContent = layer.result;
      li.append(meta, code);
      list.appendChild(li);
    }
    const lastLayer = multiLayers[multiLayers.length - 1];
    body.appendChild(section(
      `🧩 多层解码（${multiLayers.length} 层）— 最终结果`,
      list,
      lastLayer.result,
    ));
  }

  // 2) JWT（单独展示，header/payload/signature）
  if (jwt) {
    const jwtBox = document.createElement('div');
    const blocks: [string, unknown, string][] = [
      ['HEADER', jwt.header, ''],
      ['PAYLOAD', jwt.payload, ''],
      ['SIGNATURE', jwt.signature, jwt.signature],
    ];
    for (const [label, data, copyStr] of blocks) {
      const wrap = document.createElement('div');
      wrap.style.marginBottom = '8px';
      const lab = document.createElement('div');
      lab.className = `${NS}layer-meta`;
      lab.innerHTML = `<span class="${NS}layer-chip">${label}</span>`;
      if (label === 'SIGNATURE' && copyStr) {
        const b = makeCopyBtn(copyStr);
        b.style.marginLeft = 'auto';
        lab.appendChild(b);
      } else if (label === 'PAYLOAD') {
        const b = makeCopyBtn(JSON.stringify(data, null, 2));
        b.style.marginLeft = 'auto';
        lab.appendChild(b);
      }
      const code = document.createElement('pre');
      code.className = `${NS}result-code`;
      code.textContent =
        typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      wrap.append(lab, code);
      jwtBox.appendChild(wrap);
    }
    body.appendChild(section('🔑 JWT 解码', jwtBox));
  }

  // 3) 单解码：只展示成功（或有用）的结果
  const useful = singles.filter((s) => s.success && s.output && s.output.trim().length > 0);
  if (useful.length > 0) {
    const singlesBox = document.createElement('div');
    for (const s of useful) {
      const wrap = document.createElement('div');
      wrap.style.marginBottom = '8px';
      const head = document.createElement('div');
      head.className = `${NS}layer-meta`;
      head.innerHTML = `<span class="${NS}layer-chip">${s.label}</span>`;
      const b = makeCopyBtn(s.output!);
      b.style.marginLeft = 'auto';
      head.appendChild(b);
      const code = document.createElement('pre');
      code.className = `${NS}simple-code`;
      code.textContent = s.output!;
      wrap.append(head, code);
      singlesBox.appendChild(wrap);
    }
    body.appendChild(section(`📦 单项解码（${useful.length} 项命中）`, singlesBox));
  }

  // 4) 如果什么都没命中
  if (multiLayers.length === 0 && !jwt && useful.length === 0) {
    body.appendChild(emptyResultEl());

    // 可选：展示错误细节，帮助用户了解
    const failures = singles.filter((s) => !s.success && s.error);
    if (failures.length > 0) {
      const details = document.createElement('details');
      details.style.marginTop = '4px';
      const sum = document.createElement('summary');
      sum.style.fontSize = '11px';
      sum.style.color = '#64748b';
      sum.style.cursor = 'pointer';
      sum.textContent = `查看所有单项解码的失败原因（${failures.length}）`;
      const ul = document.createElement('ul');
      ul.style.margin = '6px 0 0 16px';
      ul.style.padding = '0';
      ul.style.listStyle = 'disc';
      for (const f of failures) {
        const li = document.createElement('li');
        li.style.fontSize = '11px';
        li.style.color = '#64748b';
        li.textContent = `${f.label}: ${f.error}`;
        ul.appendChild(li);
      }
      details.append(sum, ul);
      body.appendChild(details);
    }
  }
}

// ============================================================
// 显隐控制
// ============================================================

let currentSelection: string = '';
let currentRect: Rect | null = null;
let currentSelectionAnchorEl: Element | null = null; // 选区存活时捕获，供父选择器提取使用

function showToolbar(shadow: ShadowRoot): void {
  const tb = shadow.querySelector(`.${NS}toolbar`) as HTMLDivElement | null;
  if (!tb || !currentRect) return;
  tb.classList.add('visible');
  positionNear(tb, currentRect, 'below');
}
function hideToolbar(shadow: ShadowRoot): void {
  const tb = shadow.querySelector(`.${NS}toolbar`) as HTMLDivElement | null;
  tb?.classList.remove('visible');
}

function showPanel(shadow: ShadowRoot): void {
  const panel = shadow.querySelector(`.${NS}panel`) as HTMLDivElement | null;
  if (!panel || !currentRect) return;
  renderDecodeResults(panel, currentSelection);
  panel.classList.add('visible');
  // Rendering after visible ensures getBoundingClientRect works for positioning
  requestAnimationFrame(() => {
    if (currentRect) positionNear(panel, currentRect, 'below');
  });
}
function hidePanel(panel: HTMLElement | undefined | null): void {
  if (panel && panel.classList?.contains(`${NS}panel`)) {
    panel.classList.remove('visible');
    return;
  }
  // Fallback：通过宿主查
  const host = document.getElementById(HOST_ID);
  const sr = host?.shadowRoot;
  const p = sr?.querySelector<HTMLElement>(`.${NS}panel`);
  p?.classList.remove('visible');
}

// ============================================================
// 启动：绑定事件
// ============================================================

// 挂载浮动工具栏（返回卸载函数）；由 initSelectionToolbar 按名单守卫式调用
function mountSelectionToolbar(): (() => void) | null {
  if (window.self !== window.top) return null;
  if (document.getElementById(HOST_ID)) return null;

  // 动态挂载/卸载支持：所有全局监听登记到 cleanups，卸载时逐一移除
  const cleanups: Array<() => void> = [];
  const trackListener = (
    target: Document | Window,
    type: string,
    fn: EventListener,
    options?: boolean | AddEventListenerOptions,
  ): void => {
    target.addEventListener(type, fn, options);
    cleanups.push(() => target.removeEventListener(type, fn, options));
  };

  const shadow = ensureHost();
  const toolbar = shadow.querySelector(`.${NS}toolbar`) as HTMLDivElement;
  const allPanels = Array.from(shadow.querySelectorAll<HTMLElement>(`.${NS}panel`));
  const decodePanel = allPanels.find((p) => p.querySelector(`[data-${NS}-role="input-tag"]`)) as HTMLElement | undefined;
  const intelDropdown = shadow.querySelector<HTMLElement>(`.${NS}intel-dropdown`) as HTMLElement;
  const urlBody = shadow.querySelector<HTMLElement>(`[data-${NS}-role="url-body"]`);
  const urlPanel = urlBody?.closest<HTMLElement>(`.${NS}panel`) as HTMLElement | undefined;

  const buttons = toolbar.querySelectorAll<HTMLButtonElement>('button');
  const btnDecode = buttons[0];
  // btnVT / btnTB 已删除，VT + 微步 合并入「情报查询」下拉（含默认勾选）
  const btnIntel = buttons[1];
  const btnUrl = buttons[2];
  const btnAi = buttons[3];

  // AI 按钮初始状态：检查配置
  loadSettings().then((s) => {
    const ai = s.aiConfig;
    if (ai.baseUrl && ai.apiKey && ai.model) {
      btnAi?.classList.remove('disabled');
    }
  }).catch(() => undefined);

  // ---- 选区监听 ----
  let raf = 0;
  let timer: ReturnType<typeof setTimeout> | 0 = 0;
  let lastSig = '';

  function updateUrlButtonState(text: string): void {
    if (!btnUrl) return;
    const info = detectSelectionUrlOrDomain(text);
    if (info) {
      btnUrl.classList.remove('disabled');
      btnUrl.title = `URL 分析（检测为${info.kind === 'url' ? 'URL' : '域名'}：${previewInput(info.value)}）`;
    } else {
      btnUrl.classList.add('disabled');
      btnUrl.title = 'URL 分析（仅选中 URL / 域名时可用）';
    }
  }

  function applyUpdate(captured: { text: string; rect: Rect; anchorEl?: Element | null } | null) {
    if (!captured || !captured.text.trim()) {
      if (lastSig) {
        lastSig = '';
        currentSelection = '';
        currentRect = null;
        currentSelectionAnchorEl = null;
        hideToolbar(shadow);
      }
      return;
    }
    const { text, rect, anchorEl } = captured;
    const sig = text + '|' + Math.round(rect.left) + ',' + Math.round(rect.top) + ',' + Math.round(rect.right) + ',' + Math.round(rect.bottom);
    if (sig === lastSig) return;
    lastSig = sig;
    currentSelection = text;
    currentRect = rect;
    currentSelectionAnchorEl = anchorEl ?? null;
    updateUrlButtonState(text);
    showToolbar(shadow);
  }

  const scheduleUpdate = () => {
    const sync = captureSelectionNow();
    if (sync && sync.text.trim()) {
      applyUpdate(sync);
    }
    if (raf) cancelAnimationFrame(raf);
    if (timer) clearTimeout(timer);
    raf = requestAnimationFrame(() => {
      timer = setTimeout(() => {
        raf = 0;
        timer = 0;
        const a = captureSelectionNow();
        applyUpdate(a);
      }, 0);
    });
  };

  trackListener(document, 'mouseup', scheduleUpdate, true);
  trackListener(document, 'keyup', scheduleUpdate, true);
  trackListener(document, 'selectionchange', scheduleUpdate);
  trackListener(window, 'selectionchange', scheduleUpdate);
  trackListener(document, 'click', scheduleUpdate, true);

  function hideAllPopovers(): void {
    if (decodePanel) hidePanel(decodePanel);
    if (urlPanel) hidePanel(urlPanel);
    hideIntelDropdown();
  }

  trackListener(
    document,
    'mousedown',
    (e) => {
      const host = document.getElementById(HOST_ID);
      if (host?.contains(e.target as Node)) return;
      hideAllPopovers();
    },
    true,
  );

  trackListener(document, 'keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape') hideAllPopovers();
  }, true);

  const reposition = () => {
    if (currentRect) {
      const rect = getSelectionRect();
      if (rect) {
        currentRect = rect;
        if (toolbar.classList.contains('visible')) positionNear(toolbar, rect, 'below');
        for (const p of allPanels) {
          if (p.classList.contains('visible')) {
            requestAnimationFrame(() => positionNear(p, rect, 'below'));
          }
        }
        if (intelDropdown?.classList.contains('visible')) {
          requestAnimationFrame(() => positionNear(intelDropdown, rect, 'below'));
        }
      } else {
        hideToolbar(shadow);
      }
    }
  };
  trackListener(window, 'scroll', reposition, true);
  trackListener(window, 'resize', reposition);

  // ---- 按钮绑定 ----
  btnDecode?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!currentSelection) return;
    if (urlPanel?.classList.contains('visible')) hidePanel(urlPanel);
    hideIntelDropdown();
    if (!decodePanel) return;
    if (decodePanel.classList.contains('visible')) {
      hidePanel(decodePanel);
    } else {
      showPanel(shadow);
    }
  });

  btnIntel?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!currentSelection) return;
    if (decodePanel?.classList.contains('visible')) hidePanel(decodePanel);
    if (urlPanel?.classList.contains('visible')) hidePanel(urlPanel);
    const show = !intelDropdown?.classList.contains('visible');
    if (show) {
      await populateIntelDropdown(shadow, currentSelection);
      showIntelDropdown(shadow);
    } else {
      hideIntelDropdown();
    }
  });

  btnUrl?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!currentSelection) return;
    if (btnUrl.classList.contains('disabled')) return;
    if (decodePanel?.classList.contains('visible')) hidePanel(decodePanel);
    hideIntelDropdown();
    showUrlPanel(shadow);
  });

  // ---- AI 研判按钮 ----
  btnAi?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!currentSelection?.trim()) return;
    // 关键：在 await 之前同步快照锚点元素（点击后选区可能被清除/变化）
    const anchorSnapshot = currentSelectionAnchorEl;
    const selectionSnapshot = currentSelection;
    try {
      const st = await loadSettings();
      await triggerAiFromSelection(selectionSnapshot, st.aiConfig.domParentSelector, st.aiConfig.promptTemplate, anchorSnapshot);
    } catch (err) {
      showToast(shadow, err instanceof Error ? err.message : 'AI 研判配置错误');
    }
  });

  // preventDefault 防止点击工具栏时浏览器默认清除文本选区
  toolbar.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); }, true);
  for (const p of allPanels) p.addEventListener('mousedown', (e) => e.stopPropagation(), true);
  intelDropdown?.addEventListener('mousedown', (e) => e.stopPropagation(), true);

  let pollLastSig = '';
  const pollTimer = setInterval(() => {
    const cap = captureSelectionNow();
    if (!cap || !cap.text.trim()) {
      if (pollLastSig) {
        pollLastSig = '';
        applyUpdate(null);
      }
      return;
    }
    const sig = cap.text + '|' + Math.round(cap.rect.left) + ',' + Math.round(cap.rect.top);
    if (sig !== pollLastSig) {
      pollLastSig = sig;
      applyUpdate(cap);
    }
  }, 250);
  cleanups.push(() => clearInterval(pollTimer));

  scheduleUpdate();

  // 卸载：移除全部监听与宿主元素，页面恢复零痕迹
  return () => {
    for (const dispose of cleanups) dispose();
    cleanups.length = 0;
    currentSelection = '';
    currentRect = null;
    currentSelectionAnchorEl = null;
    hideToolbar(shadow);
    document.getElementById(HOST_ID)?.remove();
  };
}

// ============================================================
// 守卫式初始化：按设置名单决定是否挂载；设置变更即时挂载/卸载
// ============================================================
let toolbarBootstrapped = false;
let disposeSelectionToolbar: (() => void) | null = null;
let disposeAiChatWidget: (() => void) | null = null;

async function initSelectionToolbar(): Promise<void> {
  const hostname = window.location.hostname;

  const evaluate = (s: AppSettings): void => {
    const shouldMount = shouldShowSelectionToolbar(s, hostname);
    if (shouldMount && !disposeSelectionToolbar) {
      disposeSelectionToolbar = mountSelectionToolbar();
    } else if (!shouldMount && disposeSelectionToolbar) {
      disposeSelectionToolbar();
      disposeSelectionToolbar = null;
    }
  };

  // AI 聊天组件：按白名单决定是否挂载
  const evaluateChatWidget = async (): Promise<void> => {
    const show = await shouldShowAiChatWidget();
    if (show && !disposeAiChatWidget) {
      disposeAiChatWidget = initAiChatWidget();
    } else if (!show && disposeAiChatWidget) {
      disposeAiChatWidget();
      disposeAiChatWidget = null;
    }
  };

  try {
    evaluate(await loadSettings());
  } catch {
    if (!disposeSelectionToolbar) {
      disposeSelectionToolbar = mountSelectionToolbar();
    }
  }

  // 初始化 AI 聊天组件
  evaluateChatWidget().catch(() => {
    // settings 未就绪等异常时，仍然确保组件挂载
    if (!disposeAiChatWidget) {
      disposeAiChatWidget = initAiChatWidget();
    }
  });

  onSettingsChanged((key) => {
    if (
      key === 'selectionToolbarEnabled' ||
      key === 'selectionToolbarRules' ||
      key === 'selectionToolbarBlockRules'
    ) {
      loadSettings().then(evaluate).catch(() => undefined);
    }
    if (key === 'aiConfig') {
      void evaluateChatWidget();
    }
  });
}

// @crxjs/vite-plugin 的 content-loader 会 import 本文件并调用导出的 onExecute()
export function onExecute(_ctx?: unknown): void {
  if (toolbarBootstrapped) return;
  toolbarBootstrapped = true;
  void initSelectionToolbar();
}

// 兜底直接调用：即便 loader 没有触发 onExecute，也保证初始化一次
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => onExecute(), { once: true });
  } else {
    onExecute();
  }
}
