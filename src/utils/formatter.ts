// ============================================================
// 格式化模块 — 实现
// 由 .spec/formatter.spec.yaml 驱动
// ============================================================
import type { ToolResult, JsonPathResult, JsonDiffItem } from '../types';

// --- 工具函数 ---

function success<T>(data: T, metadata?: Record<string, string>): ToolResult<T> {
  return { success: true, data, error: null, metadata: metadata ?? null };
}

function fail(error: string): ToolResult<never> {
  return { success: false, data: undefined as never, error, metadata: null };
}

// ================================================================
// JSON 格式化 / 压缩 / 校验
// ================================================================

export function jsonFormat(
  text: string,
  indent: number = 2,
): ToolResult<string> {
  if (!text.trim()) return fail('EMPTY_INPUT');
  try {
    const parsed = JSON.parse(text);
    return success(JSON.stringify(parsed, null, indent));
  } catch {
    return fail('INVALID_JSON');
  }
}

export function jsonMinify(text: string): ToolResult<string> {
  if (!text.trim()) return fail('EMPTY_INPUT');
  try {
    const parsed = JSON.parse(text);
    return success(JSON.stringify(parsed));
  } catch {
    return fail('INVALID_JSON');
  }
}

export function jsonValidate(text: string): ToolResult<{ valid: boolean; line: number; column: number; message: string }> {
  if (!text.trim()) return fail('EMPTY_INPUT');
  try {
    JSON.parse(text);
    return success({ valid: true, line: 0, column: 0, message: 'Valid JSON' });
  } catch (e: unknown) {
    const msg = e instanceof SyntaxError ? e.message : String(e);

    // 提取行列信息
    let line = 0;
    let column = 0;
    const lineMatch = msg.match(/line\s+(\d+)/i);
    const colMatch = msg.match(/column\s+(\d+)/i);
    const posMatch = msg.match(/position\s+(\d+)/i);

    if (lineMatch) line = parseInt(lineMatch[1], 10);
    if (colMatch) column = parseInt(colMatch[1], 10);
    if (!colMatch && posMatch) {
      const pos = parseInt(posMatch[1], 10);
      const lines = text.substring(0, pos).split('\n');
      line = lines.length;
      column = lines[lines.length - 1].length + 1;
    }

    return success({ valid: false, line, column, message: msg });
  }
}

// ================================================================
// JSON 高级操作
// ================================================================

export function jsonEscape(text: string): ToolResult<string> {
  if (!text) return fail('EMPTY_INPUT');
  return success(text.replace(/[\b\f\n\r\t"\\]/g, (ch) => {
    switch (ch) {
      case '\b': return '\\b';
      case '\f': return '\\f';
      case '\n': return '\\n';
      case '\r': return '\\r';
      case '\t': return '\\t';
      case '"': return '\\"';
      case '\\': return '\\\\';
      default: return ch;
    }
  }));
}

export function jsonUnescape(text: string): ToolResult<string> {
  if (!text) return fail('EMPTY_INPUT');
  try {
    // 通过 JSON.parse 安全反转义
    return success(JSON.parse(`"${text}"`) as string);
  } catch {
    return fail('INVALID_ESCAPED_STRING');
  }
}

export function jsonPathQuery(
  text: string,
  path: string,
): ToolResult<JsonPathResult[]> {
  if (!text.trim()) return fail('EMPTY_INPUT');
  if (!path) return fail('EMPTY_PATH');

  try {
    const parsed = JSON.parse(text);
    const pathParts = parseJsonPath(path);
    const results = executeJsonPath(parsed, pathParts);
    return success(results.map((r) => ({
      path: r.path.join('.'),
      value: JSON.stringify(r.value),
    })));
  } catch {
    return fail('JSON_PATH_ERROR');
  }
}

interface PathEntry {
  path: string[];
  value: unknown;
}

function parseJsonPath(path: string): string[] {
  // 支持: $.store.book[0].title, $.store.book[*].title, $['store']['book']
  let p = path.trim();
  if (p.startsWith('$')) p = p.substring(1);
  if (p.startsWith('.')) p = p.substring(1);

  // 简单实现：按 . 分割，处理 bracket notation
  const parts: string[] = [];
  // normalize bracket notation to dots
  p = p.replace(/\[['"]?([^'"\]]+)['"]?\]/g, '.$1');
  parts.push(...p.split('.').filter(Boolean));
  return parts;
}

function executeJsonPath(root: unknown, pathParts: string[]): PathEntry[] {
  const results: PathEntry[] = [];

  function walk(current: unknown, remaining: string[], traversed: string[]) {
    if (remaining.length === 0) {
      results.push({ path: [...traversed], value: current });
      return;
    }

    const [head, ...tail] = remaining;

    if (head === '*' && Array.isArray(current)) {
      for (let i = 0; i < current.length; i++) {
        walk(current[i], tail, [...traversed, `[${i}]`]);
      }
    } else if (head === '*' && typeof current === 'object' && current !== null) {
      for (const key of Object.keys(current as Record<string, unknown>)) {
        walk((current as Record<string, unknown>)[key], tail, [...traversed, key]);
      }
    } else if (Array.isArray(current)) {
      const idx = parseInt(head, 10);
      if (!isNaN(idx) && idx >= 0 && idx < current.length) {
        walk(current[idx], tail, [...traversed, `[${idx}]`]);
      }
    } else if (typeof current === 'object' && current !== null) {
      if (head in current) {
        walk((current as Record<string, unknown>)[head], tail, [...traversed, head]);
      }
    }
  }

  walk(root, pathParts, ['$']);
  return results;
}

export function jsonDiff(
  left: string,
  right: string,
): ToolResult<JsonDiffItem[]> {
  if (!left.trim() || !right.trim()) return fail('EMPTY_INPUT');

  try {
    const a = JSON.parse(left);
    const b = JSON.parse(right);
    const diffs = diffObjects(a, b, '$');
    return success(diffs);
  } catch {
    return fail('INVALID_JSON');
  }
}

function diffObjects(
  a: unknown,
  b: unknown,
  path: string,
): JsonDiffItem[] {
  const diffs: JsonDiffItem[] = [];

  if (a === b) return diffs;

  if (typeof a !== typeof b) {
    diffs.push({
      path,
      type: 'changed',
      oldValue: JSON.stringify(a),
      newValue: JSON.stringify(b),
    });
    return diffs;
  }

  if (a === null || b === null) {
    if (a !== b) {
      diffs.push({
        path,
        type: 'changed',
        oldValue: JSON.stringify(a),
        newValue: JSON.stringify(b),
      });
    }
    return diffs;
  }

  if (typeof a === 'object' && typeof b === 'object') {
    if (Array.isArray(a) && Array.isArray(b)) {
      const maxLen = Math.max(a.length, b.length);
      for (let i = 0; i < maxLen; i++) {
        if (i >= a.length) {
          diffs.push({ path: `${path}[${i}]`, type: 'added', oldValue: undefined, newValue: JSON.stringify(b[i]) });
        } else if (i >= b.length) {
          diffs.push({ path: `${path}[${i}]`, type: 'removed', oldValue: JSON.stringify(a[i]), newValue: undefined });
        } else {
          diffs.push(...diffObjects(a[i], b[i], `${path}[${i}]`));
        }
      }
    } else if (!Array.isArray(a) && !Array.isArray(b)) {
      const keysA = Object.keys(a as Record<string, unknown>);
      const keysB = Object.keys(b as Record<string, unknown>);
      const allKeys = new Set([...keysA, ...keysB]);

      for (const key of allKeys) {
        const recA = a as Record<string, unknown>;
        const recB = b as Record<string, unknown>;
        if (!(key in recA)) {
          diffs.push({ path: `${path}.${key}`, type: 'added', oldValue: undefined, newValue: JSON.stringify(recB[key]) });
        } else if (!(key in recB)) {
          diffs.push({ path: `${path}.${key}`, type: 'removed', oldValue: JSON.stringify(recA[key]), newValue: undefined });
        } else {
          diffs.push(...diffObjects(recA[key], recB[key], `${path}.${key}`));
        }
      }
    } else {
      diffs.push({
        path,
        type: 'changed',
        oldValue: JSON.stringify(a),
        newValue: JSON.stringify(b),
      });
    }
  } else {
    diffs.push({
      path,
      type: 'changed',
      oldValue: JSON.stringify(a),
      newValue: JSON.stringify(b),
    });
  }

  return diffs;
}

// ================================================================
// Python 字面量格式化
// ================================================================

export function pythonLiteralFormat(
  text: string,
  indent: number = 2,
): ToolResult<string> {
  if (!text.trim()) return fail('EMPTY_INPUT');

  const trimmed = text.trim();
  const literalType = detectPythonLiteral(trimmed);

  if (!literalType) return fail('NOT_PYTHON_LITERAL');

  try {
    const jsValue = pythonLiteralToJS(trimmed, literalType);
    return success(JSON.stringify(jsValue, null, indent));
  } catch (e) {
    return fail('PYTHON_LITERAL_PARSE_ERROR: ' + String(e));
  }
}

function detectPythonLiteral(text: string): string | null {
  const t = text.trim();

  if (t.startsWith('{') && t.endsWith('}')) return 'dict';
  if (t.startsWith('[') && t.endsWith(']')) return 'list';
  if (t.startsWith('(') && t.endsWith(')') && t.includes(',')) return 'tuple';
  if (t.startsWith('{') && t.split(',')[0]?.endsWith('}') && !t.includes(':')) return 'set';
  if (t.startsWith('(') && t.endsWith(')') && !t.includes(',')) return 'expr';

  return null;
}

function pythonLiteralToJS(text: string, type: string): unknown {
  const t = text.trim();

  switch (type) {
    case 'dict': {
      // 识别 Python dict → JSON object
      const normalized = t
        .replace(/None/g, 'null')
        .replace(/True/g, 'true')
        .replace(/False/g, 'false')
        .replace(/'/g, '"')
        .replace(/,(\s*[}\]])/g, '$1'); // trailing comma fix

      return JSON.parse(normalized);
    }

    case 'list': {
      const normalized = t
        .replace(/None/g, 'null')
        .replace(/True/g, 'true')
        .replace(/False/g, 'false')
        .replace(/'/g, '"')
        .replace(/,(\s*\])/g, '$1');

      return JSON.parse(normalized);
    }

    case 'tuple': {
      // Tuple → Array
      const inner = t.slice(1, -1);
      const normalized = '[' + inner
        .replace(/None/g, 'null')
        .replace(/True/g, 'true')
        .replace(/False/g, 'false')
        .replace(/'/g, '"')
        .replace(/,(\s*\])/g, '$1') + ']';

      return JSON.parse(normalized);
    }

    case 'set': {
      // Set → Array (去重后)
      const inner = t.slice(1, -1);
      const normalized = '[' + inner
        .replace(/None/g, 'null')
        .replace(/True/g, 'true')
        .replace(/False/g, 'false')
        .replace(/'/g, '"')
        .replace(/,(\s*\])/g, '$1') + ']';

      const arr = JSON.parse(normalized) as unknown[];
      return [...new Set(arr)]; // 模拟 set 去重行为
    }

    default:
      throw new Error('Unknown literal type');
  }
}

// ================================================================
// SQL 格式化
// ================================================================

const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'INSERT', 'INTO', 'VALUES',
  'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'ALTER', 'DROP',
  'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'ON', 'AS', 'GROUP', 'BY',
  'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'ALL', 'DISTINCT',
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'NOT', 'NULL', 'IS', 'IN',
  'EXISTS', 'BETWEEN', 'LIKE', 'COUNT', 'SUM', 'AVG', 'MAX', 'MIN',
];

const SQL_NEWLINE_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'INSERT', 'INTO', 'VALUES',
  'UPDATE', 'SET', 'DELETE', 'CREATE', 'ALTER', 'DROP',
  'JOIN', 'INNER', 'LEFT', 'RIGHT', 'GROUP', 'BY', 'ORDER', 'HAVING',
  'LIMIT', 'UNION', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
];

export function sqlFormat(text: string): ToolResult<string> {
  if (!text.trim()) return fail('EMPTY_INPUT');

  let result = text;

  // Normalize whitespace
  result = result.replace(/\s+/g, ' ').trim();

  // Uppercase keywords
  for (const kw of SQL_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`, 'gi');
    result = result.replace(re, kw);
  }

  // Add newlines before key keywords
  for (const kw of SQL_NEWLINE_KEYWORDS) {
    const re = new RegExp(`(?<!\\n)\\b(${kw})\\b`, 'g');
    result = result.replace(re, '\n$1');
  }

  // Indent after SELECT/INSERT/UPDATE/DELETE
  const lines = result.split('\n');
  const indented: string[] = [];
  let depth = 0;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // Reduce indent for certain keywords
    const upperLine = line.toUpperCase();
    if (upperLine.startsWith(')')) depth = Math.max(0, depth - 1);

    indented.push('  '.repeat(depth) + line);

    // Increase indent after certain patterns
    if (upperLine.startsWith('(') && !upperLine.endsWith(')')) depth++;
  }

  return success(indented.join('\n'));
}

// ================================================================
// XML 格式化
// ================================================================

export function xmlFormat(text: string, indent: number = 2): ToolResult<string> {
  if (!text.trim()) return fail('EMPTY_INPUT');

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'application/xml');

    // Check for parse errors
    const parseError = doc.querySelector('parsererror');
    if (parseError) return fail('INVALID_XML');

    return success(formatXmlNode(doc.documentElement, 0, indent));
  } catch {
    return fail('INVALID_XML');
  }
}

function formatXmlNode(node: Element, depth: number, indentSize: number): string {
  const spaces = ' '.repeat(depth * indentSize);
  const attrs = formatAttributes(node);
  const tagOpen = `<${node.tagName}${attrs}`;

  const children = Array.from(node.childNodes);
  if (children.length === 0) {
    return `${spaces}<${node.tagName}${attrs}/>`;
  }

  // Text-only content
  if (children.length === 1 && children[0].nodeType === Node.TEXT_NODE) {
    const text = (children[0].textContent || '').trim();
    return `${spaces}<${node.tagName}${attrs}>${escapeXml(text)}</${node.tagName}>`;
  }

  // Mixed or element children
  const innerParts: string[] = [];
  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent?.trim();
      if (text) innerParts.push(' '.repeat((depth + 1) * indentSize) + escapeXml(text));
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      innerParts.push(formatXmlNode(child as Element, depth + 1, indentSize));
    }
  }

  return `${spaces}${tagOpen}>\n${innerParts.join('\n')}\n${spaces}</${node.tagName}>`;
}

function formatAttributes(node: Element): string {
  const attrs: string[] = [];
  for (let i = 0; i < node.attributes.length; i++) {
    const attr = node.attributes[i];
    attrs.push(` ${attr.name}="${escapeXml(attr.value)}"`);
  }
  return attrs.join('');
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
