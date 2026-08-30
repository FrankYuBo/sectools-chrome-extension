// ============================================================
// MCP Client — 通过 Streamable HTTP 连接外部 MCP Server
// 用于 AI 研判时自动查询资产信息等
// ============================================================

import type { McpServerConfig, McpToolDefinition, McpToolResult } from '../types';
import { log } from '../utils/logger';

// --- JSON-RPC types ---
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: unknown };
}

let requestId = 0;

function nextId(): number {
  return ++requestId;
}

// --- HTTP transport ---

/** 每服务器缓存的 Mcp-Session-Id（initialize 响应下发，后续请求回传） */
const sessionIds = new Map<string, string>();

async function mcpPost(
  server: McpServerConfig,
  request: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };
  if (server.authToken) {
    headers['Authorization'] = `Bearer ${server.authToken}`;
  }
  // Streamable HTTP 会话：回传服务端下发的 Mcp-Session-Id
  const sessionId = sessionIds.get(server.id);
  if (sessionId) {
    headers['Mcp-Session-Id'] = sessionId;
  }

  const resp = await fetch(server.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(30_000),
  });

  // 记录/更新会话 ID（initialize 及任意响应均可能下发）
  const newSession = resp.headers.get('mcp-session-id');
  if (newSession) {
    if (sessionIds.get(server.id) !== newSession) {
      log.info('mcp', `会话 ID 更新: ${server.name}`, { sessionId: newSession });
      sessionIds.set(server.id, newSession);
    }
  }

  if (!resp.ok) {
    // 404 常见于会话过期：清除缓存会话，下次 initialize 重建
    if (resp.status === 404 && sessionIds.has(server.id)) {
      log.warn('mcp', `会话失效(404)，清除重连: ${server.name}`);
      sessionIds.delete(server.id);
    }
    const bodyText = await resp.text().catch(() => '');
    // 403 + Invalid Origin：MCP Server 的 DNS Rebinding 防护拒绝了扩展 Origin（Forbidden header，客户端无法移除）
    if (resp.status === 403 && /invalid\s+origin/i.test(bodyText)) {
      const extId = typeof chrome !== 'undefined' && chrome.runtime?.id ? chrome.runtime.id : '<扩展ID>';
      throw new Error(
        `MCP Server 拒绝了扩展来源（403 Invalid Origin）。浏览器强制为扩展请求携带 Origin 头且无法移除，` +
        `需在服务端放行：将 "chrome-extension://${extId}" 加入 Streamable HTTP transport 的 allowedOrigins，` +
        `或本地调试时关闭 DNS Rebinding 保护（enableDnsRebindingProtection: false）。` +
        `当前扩展 Origin 可直接复制：chrome-extension://${extId}`,
      );
    }
    throw new Error(`MCP HTTP ${resp.status}: ${bodyText}`);
  }

  const ct = resp.headers.get('content-type') ?? '';
  // Streamable HTTP: server may return text/event-stream
  if (ct.includes('text/event-stream')) {
    return parseSseResponse(resp);
  }
  // Simple JSON response
  return resp.json() as Promise<JsonRpcResponse>;
}

// --- SSE stream parser (for Streamable HTTP) ---
async function parseSseResponse(resp: Response): Promise<JsonRpcResponse> {
  const reader = resp.body?.getReader();
  if (!reader) throw new Error('No response body');
  const decoder = new TextDecoder();
  let buffer = '';

  let streamDone = false;
  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) {
      streamDone = true;
      break;
    }
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data) as JsonRpcResponse;
          if (parsed.id) return parsed;
        } catch {
          // skip non-JSON data lines
        }
      }
    }
  }

  throw new Error('No valid JSON-RPC response in SSE stream');
}

// --- Public API ---

/**
 * 初始化 MCP 连接 + 获取工具列表
 */
export async function mcpInitialize(
  server: McpServerConfig,
): Promise<McpToolDefinition[]> {
  // 1. initialize
  const initReq: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: nextId(),
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'sectools-chrome', version: '0.4.0' },
    },
  };
  const initResp = await mcpPost(server, initReq);
  if (initResp.error) {
    log.error('mcp', `initialize 失败: ${server.name}`, { url: server.url, code: initResp.error.code, msg: initResp.error.message });
    throw new Error(`MCP initialize error: ${initResp.error.message}`);
  }

  // 2. Send initialized notification (fire-and-forget POST)
  try {
    await fetch(server.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(server.authToken ? { Authorization: `Bearer ${server.authToken}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });
  } catch {
    // notification, ignore errors
  }

  // 3. List tools
  const listReq: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: nextId(),
    method: 'tools/list',
    params: {},
  };
  const listResp = await mcpPost(server, listReq);
  if (listResp.error) {
    log.error('mcp', `tools/list 失败: ${server.name}`, { url: server.url, msg: listResp.error.message });
    throw new Error(`MCP tools/list error: ${listResp.error.message}`);
  }

  const tools = (listResp.result?.tools ?? []) as Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;

  log.info('mcp', `连接成功: ${server.name}`, { url: server.url, toolCount: tools.length, tools: tools.map((t) => t.name) });

  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

/**
 * 调用 MCP 工具
 */
export async function mcpCallTool(
  server: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  const start = performance.now();

  const req: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: nextId(),
    method: 'tools/call',
    params: { name: toolName, arguments: args },
  };

  const resp = await mcpPost(server, req);

  if (resp.error) {
    log.warn('mcp', `工具调用失败: ${server.name}/${toolName}`, { code: resp.error.code, msg: resp.error.message });
    return {
      serverName: server.name,
      toolName,
      success: false,
      content: resp.error.message,
      duration: Math.round(performance.now() - start),
    };
  }

  // Extract text content from MCP response
  const content = (resp.result?.content as Array<{ type: string; text?: string }> | undefined) ?? [];
  const text = content
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('\n');

  const isError = resp.result?.isError === true;

  log.info('mcp', `工具调用${isError ? '返回错误' : '成功'}: ${server.name}/${toolName}`, { durationMs: Math.round(performance.now() - start), contentLen: text.length });

  return {
    serverName: server.name,
    toolName,
    success: !isError,
    content: text || '(无返回内容)',
    duration: Math.round(performance.now() - start),
  };
}

/**
 * 自动丰富：从文本中提取 IOC，调用配置的 MCP 自动工具
 * 返回格式化的上下文字符串，可注入 AI 提示词
 */
export async function mcpAutoEnrich(
  text: string,
  servers: McpServerConfig[],
): Promise<{ context: string; results: McpToolResult[] }> {
  const enabledServers = servers.filter((s) => s.enabled && s.autoCallTools.length > 0);
  if (enabledServers.length === 0) {
    return { context: '', results: [] };
  }

  // Extract IOCs from the alert text
  const iocs = extractSimpleIocs(text);
  log.info('mcp', '自动丰富-IOC 提取', { ip: iocs.ip.length, domain: iocs.domain.length, email: iocs.email.length, hash: iocs.hash.length });

  const allResults: McpToolResult[] = [];
  const sections: string[] = [];

  for (const server of enabledServers) {
    let tools: McpToolDefinition[];
    try {
      tools = await mcpInitialize(server);
    } catch (err) {
      log.warn('mcp', `自动丰富-连接失败: ${server.name}`, String(err));
      allResults.push({
        serverName: server.name,
        toolName: '(连接)',
        success: false,
        content: err instanceof Error ? err.message : String(err),
        duration: 0,
      });
      continue;
    }

    for (const toolName of server.autoCallTools) {
      const toolDef = tools.find((t) => t.name === toolName);
      if (!toolDef) continue;

      // Try to build args from IOCs
      const args = buildToolArgs(toolDef, iocs);
      if (!args || Object.keys(args).length === 0) {
        log.info('mcp', `自动丰富-参数未匹配，跳过: ${server.name}/${toolName}`);
        continue;
      }
      log.info('mcp', `自动丰富-调用: ${server.name}/${toolName}`, args);

      const result = await mcpCallTool(server, toolName, args);
      allResults.push(result);

      if (result.success) {
        sections.push(`### MCP 工具结果：${result.serverName} / ${result.toolName}
${result.content}`);
      }
    }
  }

  const context = sections.length > 0
    ? `\n\n以下是已查询到的资产/上下文信息，请结合这些信息进行研判：\n\n${sections.join('\n\n')}`
    : '';

  return { context, results: allResults };
}

// --- Helpers ---

function extractSimpleIocs(text: string): Record<string, string[]> {
  const ipV4 = [...text.matchAll(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g)].map((m) => m[1]);
  const domains = [...text.matchAll(/\b([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\b/g)].map((m) => m[0]);
  const emails = [...text.matchAll(/\b[\w.+-]+@[\w-]+(\.[\w-]+)+\b/g)].map((m) => m[0]);
  const hashes = [
    ...text.matchAll(/\b[a-fA-F0-9]{32}\b/g),
    ...text.matchAll(/\b[a-fA-F0-9]{40}\b/g),
    ...text.matchAll(/\b[a-fA-F0-9]{64}\b/g),
  ].map((m) => m[0]);
  return { ip: [...new Set(ipV4)], domain: [...new Set(domains)], email: [...new Set(emails)], hash: [...new Set(hashes)] };
}

/**
 * 根据工具参数名/描述猜测应填入的 IOC 值
 */
function buildToolArgs(
  toolDef: McpToolDefinition,
  iocs: Record<string, string[]>,
): Record<string, unknown> | null {
  const schema = toolDef.inputSchema as { properties?: Record<string, { description?: string; type?: string }> };
  if (!schema?.properties) return null;

  const args: Record<string, unknown> = {};


  for (const [paramName, paramDef] of Object.entries(schema.properties)) {
    const paramDesc = (paramDef.description ?? '').toLowerCase();
    const paramLower = paramName.toLowerCase();
    const combined = `${paramLower} ${paramDesc}`;

    if (combined.includes('ip') && iocs.ip.length > 0) {
      args[paramName] = iocs.ip[0];
    } else if ((combined.includes('domain') || combined.includes('host') || combined.includes('url')) && iocs.domain.length > 0) {
      args[paramName] = iocs.domain[0];
    } else if (combined.includes('email') && iocs.email.length > 0) {
      args[paramName] = iocs.email[0];
    } else if ((combined.includes('hash') || combined.includes('md5') || combined.includes('sha')) && iocs.hash.length > 0) {
      args[paramName] = iocs.hash[0];
    } else if (combined.includes('ioc') || combined.includes('indicator')) {
      // Generic IOC param — try IP first, then domain
      if (iocs.ip.length > 0) args[paramName] = iocs.ip[0];
      else if (iocs.domain.length > 0) args[paramName] = iocs.domain[0];
    } else if (combined.includes('alert') || combined.includes('log') || combined.includes('text') || combined.includes('content') || combined.includes('query')) {
      // Text param — skip auto-fill (user should provide)
      continue;
    }
  }

  return Object.keys(args).length > 0 ? args : null;
}
