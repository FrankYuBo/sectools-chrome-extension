// ============================================================
// Background Service Worker — 全局逻辑
// 功能：接收 content script 的消息（如打开新标签、通知等）
// 原「右键菜单」功能已移除 → 改为 content script 选中文本浮动按钮
// ============================================================

import { loadSettings } from '../utils/settings';
import { mcpInitialize, mcpCallTool, mcpAutoEnrich } from './mcp-client';
import { enrichContext, type EnrichSummaryItem } from './enrichment';
import { log, getSwLogs } from '../utils/logger';
import {
  buildRedirectChain,
  extractJsOrMetaRedirect,
  type ObservedRedirectEvent,
} from '../utils/redirect-chain';
import type { McpToolResult } from '../types';

console.log('[SecTools] background service worker started');

// ================================================================
// 消息处理：content script → background
// ================================================================

interface OpenTabMessage {
  type: 'sec:open-tab';
  url: string;
  active?: boolean;
}

interface NotifyMessage {
  type: 'sec:notify';
  title: string;
  message: string;
}

interface UnshortenUrlMessage {
  type: 'sec:unshorten-url';
  url: string;
  maxHops?: number;
}

interface RdapQueryMessage {
  type: 'sec:rdap-query';
  target: string;
}

interface AiAnalyzeMessage {
  type: 'sec:ai-analyze';
  messages: Array<{ role: string; content: string }>;
  promptTemplate: string;
}

interface McpListToolsMessage {
  type: 'sec:mcp-list-tools';
  serverId: string;
}

interface McpCallToolMessage {
  type: 'sec:mcp-call-tool';
  serverId: string;
  toolName: string;
  args: Record<string, unknown>;
}

interface McpTestConnectionMessage {
  type: 'sec:mcp-test-connection';
  serverId: string;
}

interface LogsExportMessage {
  type: 'sec:logs-export';
}

type RuntimeMessage =
  | OpenTabMessage | NotifyMessage | UnshortenUrlMessage | RdapQueryMessage
  | AiAnalyzeMessage | McpListToolsMessage | McpCallToolMessage | McpTestConnectionMessage
  | LogsExportMessage;

chrome.runtime.onMessage.addListener((msg: RuntimeMessage, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object' || !msg.type) return false;

  switch (msg.type) {
    case 'sec:open-tab': {
      chrome.tabs.create(
        { url: (msg as OpenTabMessage).url, active: (msg as OpenTabMessage).active ?? true },
        () => {
          if (chrome.runtime.lastError) {
            console.warn('[SecTools] Failed to create tab:', chrome.runtime.lastError.message);
          }
        },
      );
      sendResponse?.({ ok: true });
      return true;
    }
    case 'sec:notify': {
      showNotification((msg as NotifyMessage).title, (msg as NotifyMessage).message);
      sendResponse?.({ ok: true });
      return true;
    }
    case 'sec:unshorten-url': {
      const { url, maxHops } = msg as UnshortenUrlMessage;
      unshortenUrl(url, maxHops)
        .then((result) => sendResponse?.({ ok: true, data: result }))
        .catch((err) => sendResponse?.({ ok: false, error: err instanceof Error ? err.message : String(err) }));
      return true;
    }
    case 'sec:rdap-query': {
      const { target } = msg as RdapQueryMessage;
      rdapQuery(target)
        .then((result) => sendResponse?.({ ok: true, data: result }))
        .catch((err) => sendResponse?.({ ok: false, error: err instanceof Error ? err.message : String(err) }));
      return true;
    }
    case 'sec:ai-analyze': {
      const { messages, promptTemplate } = msg as AiAnalyzeMessage;
      aiAnalyze(messages, promptTemplate)
        .then((result) => sendResponse?.({ ok: true, data: result.text, mcpResults: result.mcpResults, enrichSummary: result.enrichSummary }))
        .catch((err) => sendResponse?.({ ok: false, error: err instanceof Error ? err.message : String(err) }));
      return true;
    }
    case 'sec:mcp-list-tools': {
      const { serverId } = msg as McpListToolsMessage;
      handleMcpListTools(serverId)
        .then((tools) => sendResponse?.({ ok: true, data: tools }))
        .catch((err) => sendResponse?.({ ok: false, error: err instanceof Error ? err.message : String(err) }));
      return true;
    }
    case 'sec:mcp-call-tool': {
      const { serverId, toolName, args } = msg as McpCallToolMessage;
      handleMcpCallTool(serverId, toolName, args)
        .then((result) => sendResponse?.({ ok: true, data: result }))
        .catch((err) => sendResponse?.({ ok: false, error: err instanceof Error ? err.message : String(err) }));
      return true;
    }
    case 'sec:mcp-test-connection': {
      const { serverId } = msg as McpTestConnectionMessage;
      handleMcpTestConnection(serverId)
        .then((tools) => sendResponse?.({ ok: true, data: tools }))
        .catch((err) => sendResponse?.({ ok: false, error: err instanceof Error ? err.message : String(err) }));
      return true;
    }
    case 'sec:logs-export': {
      getSwLogs()
        .then((data) => sendResponse?.({ ok: true, data }))
        .catch(() => sendResponse?.({ ok: true, data: [] }));
      return true;
    }
    default:
      return false;
  }
});

// ================================================================
// 通知辅助 + Badge 视觉兜底
// ================================================================

function showNotification(title: string, message: string): void {
  chrome.notifications?.create?.(
    {
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title,
      message,
      priority: 0,
    },
    () => {
      if (chrome.runtime.lastError) {
        console.debug('[SecTools] Notification skipped:', chrome.runtime.lastError.message);
      }
    },
  );

  const success = !title.includes('失败') && !title.includes('错误');
  const badgeText = success ? '✔' : '✗';
  const badgeColor = success ? '#16a34a' : '#dc2626';
  if (chrome.action) {
    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({ color: badgeColor });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 2000);
  }
}

// ================================================================
// 短链追踪：HEAD 优先，失败降级 GET，最大跳转限制
// ================================================================

interface UnshortenHop {
  url: string;
  status: number;
  method: 'HEAD' | 'GET';
  location?: string;
  /** 降级标注（如：HTTPS 证书无效降级 HTTP） */
  note?: string;
}

interface UnshortenResult {
  finalUrl: string;
  hops: UnshortenHop[];
  totalHops: number;
  truncated: boolean;
}

const DEFAULT_MAX_HOPS = 20;
const FETCH_TIMEOUT_MS = 10_000;

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
}

function observeRedirects(): { events: ObservedRedirectEvent[]; stop: () => void } {
  const events: ObservedRedirectEvent[] = [];
  if (!chrome.webRequest?.onBeforeRedirect) {
    return { events, stop: () => undefined };
  }

  const listener = (details: chrome.webRequest.WebRedirectionResponseDetails): void => {
    events.push({
      url: details.url,
      redirectUrl: details.redirectUrl,
      statusCode: details.statusCode,
      requestMethod: details.method,
    });
  };
  chrome.webRequest.onBeforeRedirect.addListener(listener, { urls: ['<all_urls>'] });
  return {
    events,
    stop: () => chrome.webRequest.onBeforeRedirect.removeListener(listener),
  };
}

async function fetchFollowWithObservation(
  url: string,
): Promise<{ response?: Response; error?: unknown; events: ObservedRedirectEvent[] }> {
  const trace = observeRedirects();
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return { response, events: trace.events };
  } catch (error) {
    return { error, events: trace.events };
  } finally {
    trace.stop();
  }
}

async function unshortenUrl(inputUrl: string, maxHops: number = DEFAULT_MAX_HOPS): Promise<UnshortenResult> {
  const hops: UnshortenHop[] = [];
  const visited = new Set<string>(); // 防跳转死循环（A→B→A）
  let currentUrl = inputUrl;
  let truncated = false;
  const effectiveMaxHops = maxHops > 0 ? maxHops : DEFAULT_MAX_HOPS;

  for (let i = 0; i < effectiveMaxHops; i++) {
    if (visited.has(currentUrl)) {
      log.warn('unshorten', '检测到跳转环，终止跟踪', { url: currentUrl, hops: hops.length });
      break;
    }
    visited.add(currentUrl);
    let method: 'HEAD' | 'GET' = 'HEAD';
    let note: string | undefined;
    let requestUrl = currentUrl;
    let response: Response | null = null;
    let lastError = '';

    // ① HEAD（最快，多数短链服务支持）
    try {
      response = await fetch(requestUrl, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (e1) {
      lastError = e1 instanceof Error ? e1.message : String(e1);
      // ② HEAD 网络层失败（含 TLS 证书无效/过期）→ 降级 GET
      method = 'GET';
      try {
        response = await fetch(requestUrl, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      } catch (e2) {
        lastError = e2 instanceof Error ? e2.message : String(e2);
        // ③ HTTPS 全失败 → 明文 HTTP 降级（钓鱼短链域证书过期/自签极常见）
        if (requestUrl.startsWith('https://')) {
          const httpUrl = 'http://' + requestUrl.slice('https://'.length);
          try {
            response = await fetch(httpUrl, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
            requestUrl = httpUrl;
            note = 'HTTPS 请求失败（证书无效或网络拦截），已降级 HTTP 明文重试';
            log.warn('unshorten', `HTTPS 失败降级 HTTP: ${currentUrl} → ${httpUrl}`, lastError);
          } catch (e3) {
            const err = new Error(
              `无法访问 ${currentUrl}（可能原因：目标 TLS 证书无效/过期、网络不通或 DNS 解析失败。浏览器安全策略禁止扩展忽略证书错误）`,
            );
            log.error('unshorten', '短链还原失败', { url: currentUrl, httpsErr: lastError, httpErr: e3 instanceof Error ? e3.message : String(e3) });
            throw err;
          }
        } else {
          const err = new Error(`无法访问 ${currentUrl}（可能原因：网络不通、DNS 解析失败或目标拒绝连接）`);
          log.error('unshorten', '短链还原失败', { url: currentUrl, err: lastError });
          throw err;
        }
      }
    }

    // ③.5 MV3 opaque redirect 兜底：follow 到终点，同时用 webRequest 记录真实中间跳转
    const respType = (response as { type?: string }).type;
    if (respType === 'opaqueredirect' || response.status === 0) {
      log.info('unshorten', 'manual 响应为 opaque redirect，降级 follow 并观察跳转链', { url: requestUrl });
      const observed = await fetchFollowWithObservation(requestUrl);
      const chain = buildRedirectChain(requestUrl, observed.events);

      if (chain.cycle) {
        log.warn('unshorten', 'follow 跟踪检测到跳转环，安全终止', {
          url: requestUrl,
          hops: chain.hops.length,
        });
        return {
          finalUrl: chain.finalUrl,
          hops: [...hops, ...chain.hops],
          totalHops: hops.length + chain.hops.length,
          truncated: false,
        };
      }

      if (!observed.response) {
        const message = observed.error instanceof Error ? observed.error.message : String(observed.error);
        log.error('unshorten', 'follow 兜底失败', { url: requestUrl, err: message });
        throw new Error(`无法跟踪 ${requestUrl}（网络错误：${message}）`);
      }

      const followResp = observed.response;
      const finalUrl = followResp.url || chain.finalUrl;
      const completeHops = [...hops, ...chain.hops];
      if (followResp.redirected && finalUrl !== requestUrl) {
        completeHops.push({ url: finalUrl, status: followResp.status, method: 'GET', note });
        log.info('unshorten', 'follow 跟踪完成', {
          from: requestUrl,
          to: finalUrl,
          status: followResp.status,
          observedHops: chain.hops.length,
        });
      } else {
        completeHops.push({
          url: finalUrl,
          status: followResp.status,
          method: 'GET',
          note: note ?? '响应无跳转',
        });
      }
      return {
        finalUrl,
        hops: completeHops,
        totalHops: chain.hops.length,
        truncated: chain.hops.length > effectiveMaxHops,
      };
    }

    // ④ HEAD 成功但非 3xx 且无 Location → 部分短链服务不支持 HEAD，主动降级 GET 复核
    let location = response.headers.get('location');
    if (method === 'HEAD' && !location && !isRedirectStatus(response.status)) {
      try {
        const getResp = await fetch(requestUrl, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        const getLocation = getResp.headers.get('location');
        const getRespType = (getResp as { type?: string }).type;
        if (getRespType === 'opaqueredirect' || getResp.status === 0) {
          const observed = await fetchFollowWithObservation(requestUrl);
          const chain = buildRedirectChain(requestUrl, observed.events);
          if (chain.cycle) {
            log.warn('unshorten', 'GET 复核检测到跳转环，安全终止', { url: requestUrl, hops: chain.hops.length });
            return {
              finalUrl: chain.finalUrl,
              hops: [...hops, ...chain.hops],
              totalHops: hops.length + chain.hops.length,
              truncated: false,
            };
          }
          if (!observed.response) {
            const message = observed.error instanceof Error ? observed.error.message : String(observed.error);
            throw new Error(`GET 复核无法跟踪 ${requestUrl}（网络错误：${message}）`);
          }

          const finalUrl = observed.response.url || chain.finalUrl;
          const completeHops = [...hops, ...chain.hops];
          if (observed.response.redirected && finalUrl !== requestUrl) {
            completeHops.push({ url: finalUrl, status: observed.response.status, method: 'GET' });
          } else {
            completeHops.push({
              url: finalUrl,
              status: observed.response.status,
              method: 'GET',
              note: '响应无跳转',
            });
          }
          return {
            finalUrl,
            hops: completeHops,
            totalHops: chain.hops.length,
            truncated: chain.hops.length > effectiveMaxHops,
          };
        }
        response = getResp;
        location = getLocation;
        method = 'GET';
      } catch { /* 保持 HEAD 结果 */ }
    }

    const hop: UnshortenHop = { url: requestUrl, status: response.status, method };
    if (note) hop.note = note;

    if (location) {
      hop.location = location;
      let resolvedLocation: string;
      try {
        resolvedLocation = new URL(location, requestUrl).href;
      } catch {
        resolvedLocation = location;
      }
      // HTTP 降级被 301 弹回 HTTPS 原址（HTTPS 因证书无效不可达）→ 死局，明确标注后终止
      if (note && currentUrl.startsWith('https://') && resolvedLocation === currentUrl) {
        hop.note = `${note}；目标强制 HTTPS 且证书无效，无法继续跟踪（浏览器安全策略禁止忽略证书错误，可手动在浏览器打开并点击"继续访问"查看真实跳转）`;
        hops.push(hop);
        log.warn('unshorten', 'HTTP→HTTPS 弹回死局，终止跟踪', { url: currentUrl, hops: hops.length });
        return { finalUrl: resolvedLocation, hops, totalHops: hops.length, truncated: false };
      }
      hops.push(hop);
      log.info('unshorten', `HTTP 跳转 #${hops.length}`, { from: requestUrl, to: location, status: response.status, method, note });
      currentUrl = resolvedLocation;
      continue;
    }

    // ⑤ 无 Location 的 GET 200 HTML → 解析 JS 跳转 / Meta Refresh（国内短链极常见）
    if (method === 'GET' && !isRedirectStatus(response.status)) {
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('text/html')) {
        let html = '';
        try {
          const buf = await response.clone().arrayBuffer();
          html = new TextDecoder().decode(buf.slice(0, 64 * 1024));
        } catch { /* body 不可读则跳过 */ }
        const jsTarget = extractJsOrMetaRedirect(html);
        if (jsTarget) {
          let resolved: string;
          try {
            resolved = new URL(jsTarget, requestUrl).href;
          } catch {
            resolved = jsTarget;
          }
          if (visited.has(resolved)) {
            hops.push(hop);
            log.warn('unshorten', 'JS 跳转目标成环，终止', { url: resolved });
            return { finalUrl: requestUrl, hops, totalHops: hops.length, truncated: false };
          }
          hop.location = resolved;
          hop.note = `${hop.note ? hop.note + '；' : ''}页面内跳转（JS/Meta Refresh）`;
          hops.push(hop);
          log.info('unshorten', `JS/Meta 跳转 #${hops.length}`, { from: requestUrl, to: resolved, status: response.status });
          currentUrl = resolved;
          continue;
        }
      }
    }

    // 无任何跳转 → 到达终点
    hops.push(hop);
    log.info('unshorten', '还原完成', { finalUrl: requestUrl, hops: hops.length, note });
    return { finalUrl: requestUrl, hops, totalHops: hops.length, truncated: false };
  }

  truncated = true;
  return { finalUrl: currentUrl, hops, totalHops: hops.length, truncated };
}

// ================================================================
// RDAP 查询：支持 IP、域名、ASN
// ================================================================

type RdapTargetType = 'ip' | 'domain' | 'asn' | 'unknown';

interface RdapResult {
  type: RdapTargetType;
  target: string;
  data: unknown;
  source: string;
}

const RDAP_BASE_IPOASN = 'https://rdap.org';
const RDAP_BASE_DOMAIN = 'https://rdap.org';

function detectTargetType(target: string): RdapTargetType {
  const asnMatch = target.match(/^(?:AS)?(\d+)$/i);
  if (asnMatch) return 'asn';

  const ipv4Match = target.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/\d{1,2})?$/);
  if (ipv4Match) {
    const parts = ipv4Match.slice(1, 5).map(Number);
    if (parts.every((p) => p >= 0 && p <= 255)) return 'ip';
  }

  const ipv6Match = target.match(/^[0-9a-fA-F:]+$/);
  if (ipv6Match && target.includes(':')) return 'ip';

  if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}$/.test(target) || /\.[a-zA-Z]{2,}$/.test(target)) {
    return 'domain';
  }

  return 'unknown';
}

async function rdapQuery(target: string): Promise<RdapResult> {
  const trimmed = target.trim();
  if (!trimmed) throw new Error('RDAP 查询目标不能为空');

  const type = detectTargetType(trimmed);
  if (type === 'unknown') throw new Error(`无法识别的查询目标类型: ${trimmed}`);

  let rdapUrl: string;
  let queryPath: string;

  switch (type) {
    case 'ip': {
      const hasCidr = trimmed.includes('/');
      queryPath = hasCidr ? `cidr/${trimmed}` : `ip/${trimmed}`;
      rdapUrl = `${RDAP_BASE_IPOASN}/${queryPath}`;
      break;
    }
    case 'domain': {
      queryPath = `domain/${trimmed}`;
      rdapUrl = `${RDAP_BASE_DOMAIN}/${queryPath}`;
      break;
    }
    case 'asn': {
      const asNum = trimmed.replace(/^AS/i, '');
      queryPath = `autnum/${asNum}`;
      rdapUrl = `${RDAP_BASE_IPOASN}/${queryPath}`;
      break;
    }
    default:
      throw new Error(`不支持的查询类型: ${type}`);
  }

  const response = await fetch(rdapUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/rdap+json, application/json',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`RDAP 未找到记录 (404): ${trimmed}`);
    }
    throw new Error(`RDAP 查询失败: HTTP ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return {
    type,
    target: trimmed,
    data,
    source: rdapUrl,
  };
}

// ================================================================
// AI 研判：调用 OpenAI 兼容 API（background 中执行以避免 CORS）
// 支持多轮对话：content script 维护消息历史，background 负责拼接 system prompt + 调用
// ================================================================

interface AiAnalyzeResult {
  text: string;
  mcpResults: McpToolResult[];
  enrichSummary: EnrichSummaryItem[];
}

async function aiAnalyze(messages: Array<{ role: string; content: string }>, promptTemplate: string): Promise<AiAnalyzeResult> {
  const settings = await loadSettings();
  const { baseUrl, apiKey, model, mcpServers, enrichment } = settings.aiConfig;

  if (!baseUrl || !apiKey || !model) {
    throw new Error('请先在设置中配置 AI 研判（Base URL / API Key / 模型）');
  }

  // system prompt 用第一条 user 消息内容替换模板中的 {{content}}
  const firstUserMsg = messages.find((m) => m.role === 'user');
  const rawContent = firstUserMsg?.content ?? '';

  // MCP 自动丰富：查询资产信息
  let mcpContext = '';
  let mcpResults: McpToolResult[] = [];
  if (mcpServers.length > 0) {
    try {
      log.info('ai', 'MCP 自动丰富开始', { servers: mcpServers.length });
      const enrichResult = await mcpAutoEnrich(rawContent, mcpServers);
      mcpContext = enrichResult.context;
      mcpResults = enrichResult.results;
      log.info('ai', 'MCP 自动丰富完成', { okCount: mcpResults.filter((r) => r.success).length, failCount: mcpResults.filter((r) => !r.success).length, contextLen: mcpContext.length });
    } catch (err) {
      log.warn('ai', 'MCP 自动丰富失败（不影响 AI 调用）', String(err));
    }
  }

  // 免费情报富化：abuse.ch / KEV / NVD / DoH / 本地 ip2region + Key 型源裁切
  let enrichCtxText = '';
  let enrichSummary: EnrichSummaryItem[] = [];
  if (enrichment?.enabled) {
    try {
      const outcome = await enrichContext(rawContent, enrichment);
      enrichCtxText = outcome.context;
      enrichSummary = outcome.summary;
    } catch (err) {
      log.warn('ai', '情报富化失败（不影响 AI 调用）', String(err));
    }
  }

  const systemContent = promptTemplate.replace(
    '{{content}}',
    rawContent + mcpContext + enrichCtxText,
  );

  // 智能拼接 API URL，兼容各种用户输入格式
  let apiBase = baseUrl.replace(/\/+$/, '');
  if (!apiBase.endsWith('/chat/completions')) {
    if (!apiBase.match(/\/v\d+\/?$/)) {
      apiBase += '/v1';
    }
  }
  const apiBaseClean = apiBase.replace(/\/+$/, '');

  log.info('ai', '调用 AI API', { model, url: `${apiBaseClean}/chat/completions`, msgCount: messages.length + 1, contentLen: rawContent.length });

  const apiUrl = `${apiBaseClean}/chat/completions`;
  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemContent },
        ...messages,
      ],
      stream: false,
    }),
    signal: AbortSignal.timeout(120_000),
  }).catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    const isTimeout = (e as { name?: string })?.name === 'TimeoutError' || /signal timed out|timed? ?out/i.test(msg);
    log.error('ai', isTimeout ? 'AI API 请求超时' : 'AI API 网络错误', { url: apiUrl, model, err: msg });
    if (isTimeout) {
      throw new Error(`AI API 请求超时（120 秒无响应）。请检查：① Base URL 是否可达（${apiUrl}）② 本机网络/代理是否放行该域名 ③ 模型服务是否过载，稍后重试`);
    }
    throw new Error(`无法连接 AI API（${msg}）。请检查 Base URL（${apiUrl}）是否正确、网络是否可达`);
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    log.error('ai', `AI API HTTP ${resp.status}`, body.slice(0, 500));
    throw new Error(`AI API 返回 HTTP ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json();
  const result = data.choices?.[0]?.message?.content;
  if (!result) {
    log.error('ai', 'AI API 返回结果为空', data);
    throw new Error('AI API 返回结果为空');
  }
  log.info('ai', 'AI API 响应成功', { respLen: result.length });
  return { text: result, mcpResults, enrichSummary };
}

// ================================================================
// MCP 处理函数
// ================================================================

function findServer(serverId: string) {
  return loadSettings().then((s) => s.aiConfig.mcpServers.find((m) => m.id === serverId));
}

async function handleMcpTestConnection(serverId: string) {
  const server = await findServer(serverId);
  if (!server) throw new Error('未找到 MCP 服务器配置');
  const tools = await mcpInitialize(server);
  return { serverName: server.name, toolCount: tools.length, tools };
}

async function handleMcpListTools(serverId: string) {
  const server = await findServer(serverId);
  if (!server) throw new Error('未找到 MCP 服务器配置');
  return mcpInitialize(server);
}

async function handleMcpCallTool(serverId: string, toolName: string, args: Record<string, unknown>) {
  const server = await findServer(serverId);
  if (!server) throw new Error('未找到 MCP 服务器配置');
  return mcpCallTool(server, toolName, args);
}
