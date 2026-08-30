// ============================================================
// sigma-lint 轻量校验器
// 基于 Sigma 规则 (YAML) 结构与语义的静态检查
// 覆盖：YAML 基本结构、必填字段、logsource 分类、detection 引用、condition 表达式
// ============================================================

import type {
  SigmaLintIssue,
  SigmaLintResult,
  SigmaLintSeverity,
  SigmaLogSourceCategory,
} from '../types/regex-yara-sigma';

interface LineInfo {
  idx: number;
  line: string;
  stripped: string;
  lineNo: number;
  indent: number;
}

interface SimpleYamlNode {
  key: string;
  value: string | null;
  startLine: number;
  endLine: number;
  indent: number;
  children: SimpleYamlNode[];
  rawLines: string[];
}

const RECOMMENDED_TOP_LEVEL = new Set([
  'title', 'id', 'status', 'description', 'author',
  'date', 'modified', 'tags', 'logsource', 'detection',
  'condition', 'falsepositives', 'level', 'references', 'fields',
]);

const VALID_STATUS = new Set(['stable', 'test', 'experimental', 'deprecated', 'unsupported']);
const VALID_LEVEL = new Set(['informational', 'low', 'medium', 'high', 'critical']);

const LOGSOURCE_CATEGORY_MAP: Record<string, SigmaLogSourceCategory> = {
  'process-creation': 'process_creation',
  'process creation': 'process_creation',
  'process_creation': 'process_creation',
  'process': 'process_creation',
  'network': 'network_connection',
  'network-connection': 'network_connection',
  'network_connection': 'network_connection',
  'network_connection_initiated': 'network_connection',
  'file': 'file_event',
  'file-event': 'file_event',
  'file_event': 'file_event',
  'file change': 'file_event',
  'registry': 'registry_event',
  'registry-event': 'registry_event',
  'registry_event': 'registry_event',
  'registry add': 'registry_event',
  'registry set': 'registry_event',
  'dns': 'dns_query',
  'dns-query': 'dns_query',
  'dns_query': 'dns_query',
  'driver': 'driver_load',
  'driver-load': 'driver_load',
  'driver_load': 'driver_load',
  'image': 'image_load',
  'image-load': 'image_load',
  'image_load': 'image_load',
  'pipe': 'pipe_event',
  'pipe-event': 'pipe_event',
  'pipe_event': 'pipe_event',
  'pipe created': 'pipe_event',
  'wmi': 'wmi_event',
  'wmi-event': 'wmi_event',
  'wmi_event': 'wmi_event',
  'process-access': 'process_access',
  'process_access': 'process_access',
};

const COMMON_PROCESS_FIELDS = new Set([
  'Image', 'ProcessId', 'ParentImage', 'ParentProcessId', 'CommandLine',
  'OriginalFileName', 'Company', 'Description', 'Product', 'User',
  'IntegrityLevel', 'Hashes', 'md5', 'sha1', 'sha256', 'imphash',
  'CurrentDirectory',
]);

const COMMON_NETWORK_FIELDS = new Set([
  'DestinationIp', 'DestinationPort', 'DestinationHostname', 'DestinationIsIp',
  'SourceIp', 'SourcePort', 'SourceHostname', 'SourceIsIp',
  'Protocol', 'Initiated', 'Image', 'User', 'Url', 'HttpRequestMethod',
]);

const COMMON_FILE_FIELDS = new Set([
  'TargetFilename', 'Filename', 'Image', 'ProcessId', 'User',
  'Operation', 'SourceFilename', 'ObjectName', 'Contents',
  'CreationUtcTime', 'PreviousCreationUtcTime',
]);

const COMMON_REGISTRY_FIELDS = new Set([
  'TargetObject', 'ObjectValueName', 'ObjectValueType', 'Details',
  'Image', 'ProcessId', 'User', 'EventType', 'Hive', 'KeyPath',
]);

const COMMON_DNS_FIELDS = new Set([
  'QueryName', 'QueryStatus', 'QueryResults', 'Image', 'ProcessId',
  'User', 'answer', 'rrname',
]);

function splitLines(src: string): LineInfo[] {
  return src.split(/\r?\n/).map((line, idx) => {
    let indent = 0;
    while (indent < line.length && (line[indent] === ' ')) indent++;
    // tabs in indent
    const stripped = line.trim();
    return { idx, line, stripped, lineNo: idx + 1, indent };
  });
}

function addIssue(
  issues: SigmaLintIssue[],
  severity: SigmaLintSeverity,
  code: string,
  message: string,
  line: number | null = null,
  field: string | null = null,
  suggestion?: string,
) {
  issues.push({ severity, line, field, code, message, suggestion });
}

function stripInlineComment(line: string): string {
  let out = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    if (ch === '"' && !inSingle) inDouble = !inDouble;
    if (ch === '#' && !inSingle && !inDouble && (i === 0 || /\s/.test(line[i - 1]))) {
      break;
    }
    out += ch;
  }
  return out;
}

function parseSimpleYaml(src: string): { root: SimpleYamlNode; issues: SigmaLintIssue[] } {
  const issues: SigmaLintIssue[] = [];
  const lines = splitLines(src);
  const root: SimpleYamlNode = {
    key: '__root__', value: null, startLine: 1, endLine: 0, indent: -1,
    children: [], rawLines: [],
  };

  const stack: SimpleYamlNode[] = [root];
  let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    const content = stripInlineComment(ln.line);
    const stripped = content.trim();

    if (!stripped) { i++; continue; }

    // Tab in indent
    if (/^\t+/.test(ln.line)) {
      addIssue(issues, 'error', 'SG_E_TAB_INDENT',
        'YAML 禁止使用 Tab 缩进，请改用空格', ln.lineNo);
    }

    // Check parent
    while (stack.length > 1 && stack[stack.length - 1].indent >= ln.indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];

    // Sequence item (- ...)
    if (stripped.startsWith('- ')) {
      const seqContent = stripped.slice(2).trim();
      const sub: SimpleYamlNode = {
        key: '-',
        value: seqContent.length ? seqContent : null,
        startLine: ln.lineNo,
        endLine: ln.lineNo,
        indent: ln.indent + 2,
        children: [],
        rawLines: [ln.line],
      };
      // If it is "- key: value" form, create child
      if (sub.value != null && /^[A-Za-z_][A-Za-z0-9_-]*\s*:/.test(sub.value)) {
        const colonIdx = sub.value.indexOf(':');
        const k = sub.value.slice(0, colonIdx).trim();
        const v = sub.value.slice(colonIdx + 1).trim() || null;
        const child: SimpleYamlNode = {
          key: k, value: v, startLine: ln.lineNo, endLine: ln.lineNo,
          indent: sub.indent + 2, children: [], rawLines: [ln.line],
        };
        sub.value = null;
        sub.children.push(child);
        stack.push(sub);
        stack.push(child);
        parent.children.push(sub);
        i++;
        continue;
      }
      parent.children.push(sub);
      stack.push(sub);
      i++;
      continue;
    }

    // key: value pair
    const colonMatch = stripped.match(/^([A-Za-z_][A-Za-z0-9_.-]*)\s*:(.*)$/);
    if (colonMatch) {
      const key = colonMatch[1];
      const rest = colonMatch[2].trim();
      const node: SimpleYamlNode = {
        key, value: rest || null,
        startLine: ln.lineNo, endLine: ln.lineNo,
        indent: ln.indent,
        children: [],
        rawLines: [ln.line],
      };

      // Multiline scalar: | or >
      if (rest === '|' || rest === '>' || /^[|>][+-]?\s*$/.test(rest)) {
        i++;
        const scalarLines: string[] = [];
        while (i < lines.length) {
          const nln = lines[i];
          if (nln.stripped === '') { scalarLines.push(''); i++; continue; }
          if (nln.indent <= ln.indent) break;
          scalarLines.push(nln.line);
          i++;
        }
        node.endLine = lines[i - 1]?.lineNo ?? ln.lineNo;
        node.rawLines.push(...scalarLines);
        parent.children.push(node);
        continue;
      }

      // Folded inline JSON/dict "{...}" -> just store as value
      // Check if value is empty -> has children
      if (rest === '') {
        parent.children.push(node);
        stack.push(node);
        i++;
        continue;
      }

      // Inline list [a, b, c] - store raw value
      parent.children.push(node);
      i++;
      continue;
    }

    // Floating text - could be multi-line string
    if (parent.value == null && parent.children.length === 0) {
      parent.value = stripped;
      parent.rawLines.push(ln.line);
    } else {
      // Ignore silently or collect as raw
      parent.rawLines.push(ln.line);
    }
    i++;
  }

  return { root, issues };
}

function findNode(root: SimpleYamlNode, path: string[]): SimpleYamlNode | null {
  let cur: SimpleYamlNode = root;
  for (const p of path) {
    const n = cur.children.find((c) => c.key.toLowerCase() === p.toLowerCase());
    if (!n) return null;
    cur = n;
  }
  return cur;
}

function getScalarValue(node: SimpleYamlNode | null): string | null {
  if (!node) return null;
  if (node.value != null) {
    let v = node.value;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    return v;
  }
  return null;
}

function isInlineList(v: string): boolean {
  return /^\s*\[.*\]\s*$/.test(v);
}

function getListItems(node: SimpleYamlNode): string[] {
  if (node.value != null && isInlineList(node.value)) {
    const inner = node.value.slice(node.value.indexOf('[') + 1, node.value.lastIndexOf(']'));
    return inner.split(',').map((s) => {
      let t = s.trim();
      if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
        t = t.slice(1, -1);
      }
      return t;
    }).filter(Boolean);
  }
  return node.children
    .filter((c) => c.key === '-' && c.value != null)
    .map((c) => {
      let v = c.value!;
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return v;
    });
}

function parseCondition(condition: string): { refs: Set<string>; errors: string[] } {
  const refs = new Set<string>();
  const errors: string[] = [];

  // Extract identifier-like tokens
  const tokens = condition
    .replace(/\b(and|or|not|one of|all of|any of|none of|1 of|of)\b/gi, ' ')
    .match(/[A-Za-z_][A-Za-z0-9_]*/g);
  if (tokens) {
    for (const t of tokens) {
      const low = t.toLowerCase();
      if (low === 'and' || low === 'or' || low === 'not' || low === 'true' || low === 'false') continue;
      refs.add(t);
    }
  }

  // Basic "X of Y" constructs referenced as list via special keyword -> Y is added too
  const ofRefs = condition.match(/\b(?:1|one|any|all|none)\s+of\s+([A-Za-z_][A-Za-z0-9_]*)\b/gi);
  if (ofRefs) {
    for (const m of ofRefs) {
      const p = m.split(/\s+/);
      if (p.length) refs.add(p[p.length - 1]);
    }
  }

  return { refs, errors };
}

function classifyLogsource(logsrc: SimpleYamlNode | null): SigmaLogSourceCategory | null {
  if (!logsrc) return null;
  const cat = getScalarValue(findNode(logsrc, ['category']));
  const prod = getScalarValue(findNode(logsrc, ['product']));
  const serv = getScalarValue(findNode(logsrc, ['service']));

  const candidates = [cat, prod, serv].filter(Boolean) as string[];
  for (const c of candidates) {
    const key = c.toLowerCase();
    for (const [k, v] of Object.entries(LOGSOURCE_CATEGORY_MAP)) {
      if (key.includes(k)) return v;
    }
  }
  return 'other';
}

function countSeverity(issues: SigmaLintIssue[], s: SigmaLintSeverity): number {
  return issues.filter((i) => i.severity === s).length;
}

export function lintSigma(source: string): SigmaLintResult {
  const issues: SigmaLintIssue[] = [];
  const { root, issues: yamlIssues } = parseSimpleYaml(source);
  issues.push(...yamlIssues);

  if (!source.trim()) {
    return {
      valid: true, issues: [],
      hasTitle: false, hasLogSource: false, hasDetection: false, hasCondition: false,
      logSourceCategory: null, detectionKeys: [], conditionRefs: [], undefinedRefs: [],
    };
  }

  // --- Top-level keys ---
  const topKeys = new Set(root.children.map((c) => c.key.toLowerCase()));

  // Required
  for (const req of ['title', 'logsource', 'detection', 'condition']) {
    if (!topKeys.has(req)) {
      addIssue(issues, 'error', `SG_E_MISSING_${req.toUpperCase()}`,
        `缺少必填字段 "${req}"`, null, req,
        req === 'title' ? '添加 title: "规则简述标题"' :
          req === 'logsource' ? '添加 logsource 段指定 category/product/service' :
            req === 'detection' ? '添加 detection 段声明选择器' :
              '添加 condition 声明检测表达式');
    }
  }

  // Unknown/unusual top-level keys
  for (const child of root.children) {
    if (!RECOMMENDED_TOP_LEVEL.has(child.key.toLowerCase()) && child.key !== '-') {
      addIssue(issues, 'info', 'SG_I_UNKNOWN_TOP',
        `顶层字段 "${child.key}" 不是 Sigma 推荐字段`, child.startLine, child.key);
    }
  }

  // --- Title ---
  const titleNode = findNode(root, ['title']);
  const titleVal = getScalarValue(titleNode);
  const hasTitle = titleVal != null && titleVal.trim().length > 0;
  if (titleVal && titleVal.trim().length < 8) {
    addIssue(issues, 'warning', 'SG_W_SHORT_TITLE',
      'title 过短，建议简明描述检测意图（如 "Suspicious PowerShell EncodedCommand"）',
      titleNode?.startLine ?? null, 'title');
  }

  // --- Status ---
  const statusVal = getScalarValue(findNode(root, ['status']));
  if (statusVal && !VALID_STATUS.has(statusVal.toLowerCase())) {
    addIssue(issues, 'warning', 'SG_W_STATUS_VAL',
      `status 值 "${statusVal}" 非标准值，推荐: ${Array.from(VALID_STATUS).join(', ')}`,
      findNode(root, ['status'])?.startLine ?? null, 'status');
  }

  // --- Level ---
  const levelVal = getScalarValue(findNode(root, ['level']));
  if (levelVal && !VALID_LEVEL.has(levelVal.toLowerCase())) {
    addIssue(issues, 'warning', 'SG_W_LEVEL_VAL',
      `level 值 "${levelVal}" 非标准值，推荐: ${Array.from(VALID_LEVEL).join(', ')}`,
      findNode(root, ['level'])?.startLine ?? null, 'level');
  }

  // --- ID / UUID ---
  const idVal = getScalarValue(findNode(root, ['id']));
  if (idVal && !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(idVal)) {
    addIssue(issues, 'warning', 'SG_W_ID_FMT',
      'id 字段应为标准 UUID 格式（xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx）',
      findNode(root, ['id'])?.startLine ?? null, 'id');
  }
  if (!idVal) {
    addIssue(issues, 'info', 'SG_I_NO_ID',
      '建议为规则添加唯一 id (UUIDv4)，便于跨系统共享追踪', null, 'id');
  }

  // --- Description ---
  const descVal = getScalarValue(findNode(root, ['description']));
  if (!descVal) {
    addIssue(issues, 'warning', 'SG_W_NO_DESC',
      '缺少 description，建议写明攻击背景、触发条件与误报场景', null, 'description');
  } else if (descVal.length < 15) {
    addIssue(issues, 'warning', 'SG_W_SHORT_DESC',
      'description 过短，描述不够详细',
      findNode(root, ['description'])?.startLine ?? null, 'description');
  }

  // --- Logsource ---
  const logsrcNode = findNode(root, ['logsource']);
  const hasLogSource = !!logsrcNode && (logsrcNode.children.length > 0 || logsrcNode.value != null);
  const logSourceCategory: SigmaLogSourceCategory | null = classifyLogsource(logsrcNode);

  if (logsrcNode) {
    const lsKeys = new Set(logsrcNode.children.map((c) => c.key.toLowerCase()));
    if (lsKeys.size === 0) {
      addIssue(issues, 'error', 'SG_E_LOGSRC_EMPTY',
        'logsource 段为空，至少需提供 category / product / service 之一',
        logsrcNode.startLine, 'logsource');
    }
    if (!lsKeys.has('category') && !lsKeys.has('product') && !lsKeys.has('service')) {
      addIssue(issues, 'warning', 'SG_W_LOGSRC_WEAK',
        'logsource 中缺少 category/product/service，导致规则不易路由',
        logsrcNode.startLine, 'logsource');
    }
    if (logSourceCategory === 'other') {
      const catVal = getScalarValue(findNode(logsrcNode, ['category']));
      if (catVal) {
        addIssue(issues, 'info', 'SG_I_LOGSRC_CAT',
          `无法识别 logsource.category="${catVal}"，将归类为 other`,
          findNode(logsrcNode, ['category'])?.startLine ?? null, 'logsource.category');
      }
    }
  }

  // --- Detection ---
  const detectionNode = findNode(root, ['detection']);
  const detectionKeys: string[] = [];
  const hasDetection = !!detectionNode;
  const knownFieldSets: Record<SigmaLogSourceCategory, Set<string>> = {
    process_creation: COMMON_PROCESS_FIELDS,
    network_connection: COMMON_NETWORK_FIELDS,
    file_event: COMMON_FILE_FIELDS,
    registry_event: COMMON_REGISTRY_FIELDS,
    dns_query: COMMON_DNS_FIELDS,
    driver_load: new Set(['ImageLoaded', 'DriverName', 'Image', 'ProcessId']),
    image_load: new Set(['Image', 'ImageLoaded', 'ProcessId', 'User', 'Company', 'Description']),
    pipe_event: new Set(['PipeName', 'Image', 'ProcessId', 'User', 'EventType']),
    wmi_event: new Set(['EventType', 'Namespace', 'Operation', 'Query', 'Consumer', 'Filter']),
    process_access: new Set(['SourceImage', 'TargetImage', 'CallTrace', 'GrantedAccess', 'SourceProcessId', 'TargetProcessId']),
    other: new Set(),
  };

  if (detectionNode) {
    const selectorNodes = detectionNode.children.filter((c) => c.key !== 'condition');
    if (selectorNodes.length === 0) {
      addIssue(issues, 'error', 'SG_E_DETECTION_EMPTY',
        'detection 段为空，需声明至少一个选择器 (如 selection:)',
        detectionNode.startLine, 'detection');
    }

    for (const sel of selectorNodes) {
      detectionKeys.push(sel.key);

      // Validate field names against logsource category
      const checkField = (field: string, line: number) => {
        const f = field.split('|')[0]; // strip modifiers
        if (!f) return;
        if (logSourceCategory && knownFieldSets[logSourceCategory]) {
          const common = knownFieldSets[logSourceCategory];
          if (common.size > 0 && !common.has(f)) {
            // Relaxed: info only
            addIssue(issues, 'info', 'SG_I_FIELD_UNCOMMON',
              `字段 "${f}" 在 logsource 类别 "${logSourceCategory}" 中不常见`,
              line, `detection.${sel.key}.${f}`);
          }
        }
      };

      if (sel.key === 'timeframe') {
        const v = getScalarValue(sel);
        if (v && !/^\s*\d+\s*(ns|us|ms|s|m|h|d|w)\s*$/i.test(v)) {
          addIssue(issues, 'warning', 'SG_W_TIMEFRAME_FMT',
            `timeframe 值 "${v}" 格式可疑，应如 "5m"/"1h"/"30s"/"1d"`,
            sel.startLine, 'detection.timeframe');
        }
        continue;
      }

      // key: value pair map
      for (const child of sel.children) {
        if (child.key === '-') {
          // sequence item
          for (const gchild of child.children) {
            checkField(gchild.key, gchild.startLine);
          }
          continue;
        }
        checkField(child.key, child.startLine);
      }

      // Check that selectors actually content non-empty
      if (sel.children.length === 0 && sel.value == null) {
        addIssue(issues, 'warning', 'SG_W_EMPTY_SELECTOR',
          `选择器 detection.${sel.key} 为空`, sel.startLine, `detection.${sel.key}`);
      }
    }
  }

  // --- Condition ---
  const condNode = findNode(root, ['condition']);
  let condVal = getScalarValue(condNode) ?? '';
  if (condNode && condNode.rawLines.length > 1) {
    condVal = condNode.rawLines.map((l) => l.replace(/^.*:\s*/, '')).join(' ');
  }
  const hasCondition = condVal.trim().length > 0;

  const conditionRefs: string[] = [];
  const undefinedRefs: string[] = [];

  if (condVal.trim().length === 0) {
    addIssue(issues, 'error', 'SG_E_COND_EMPTY',
      'condition 为空，需声明检测逻辑',
      condNode?.startLine ?? null, 'condition');
  } else {
    const parsed = parseCondition(condVal);
    conditionRefs.push(...Array.from(parsed.refs));

    // Check each ref against detection selectors
    const detectionSet = new Set(detectionKeys.map((k) => k.toLowerCase()));
    for (const ref of parsed.refs) {
      const low = ref.toLowerCase();
      if (low === 'filter' || low === 'selection') continue;
      if (detectionSet.has(low)) continue;
      // Accept common keywords that parser incorrectly picked up
      if (['xof', 'them', 'any', 'all', 'none', 'one'].includes(low)) continue;
      undefinedRefs.push(ref);
      addIssue(issues, 'error', 'SG_E_UNDEF_REF',
        `condition 引用了 detection 中未定义的选择器 "${ref}"`,
        condNode?.startLine ?? null, 'condition');
    }

    // Operators balance (parentheses)
    let paren = 0;
    for (const ch of condVal) {
      if (ch === '(') paren++;
      if (ch === ')') paren--;
    }
    if (paren !== 0) {
      addIssue(issues, 'error', 'SG_E_PAREN_MISMATCH',
        `condition 圆括号不平衡（${paren > 0 ? '缺少 ' + paren + ' 个 )' : '多余 ' + -paren + ' 个 )'}）`,
        condNode?.startLine ?? null, 'condition');
    }

    // Trivial "selection" only if no detection.selection declared
    if (condVal.trim() === 'selection' && !detectionSet.has('selection')) {
      addIssue(issues, 'warning', 'SG_W_MISSING_SELECTION',
        'condition="selection" 但 detection 中没有声明名为 selection 的选择器',
        condNode?.startLine ?? null, 'condition');
    }

    // Recommend using proper operators
    if (/^\s*[A-Za-z_][A-Za-z0-9_]*\s*$/.test(condVal)) {
      // Single selector - fine, just info if could be more
    } else if (!/( and | or | not | of |\(|\))/i.test(condVal) && conditionRefs.length > 1) {
      addIssue(issues, 'info', 'SG_I_NO_OPERATOR',
        'condition 中引用多个选择器但未出现 and/or/not，需确认书写正确',
        condNode?.startLine ?? null, 'condition');
    }
  }

  // --- Detection selectors unused (informational) ---
  if (hasCondition && detectionKeys.length > 0 && conditionRefs.length > 0) {
    const refSet = new Set(conditionRefs.map((r) => r.toLowerCase()));
    for (const k of detectionKeys) {
      if (k.toLowerCase() === 'timeframe') continue;
      if (!refSet.has(k.toLowerCase())) {
        // Don't spam if complex "X of them" style - check 'them' keyword
        if (/them/.test(condVal.toLowerCase())) continue;
        addIssue(issues, 'warning', 'SG_W_UNUSED_SEL',
          `detection.${k} 在 condition 中未被引用`,
          detectionNode?.children.find((c) => c.key === k)?.startLine ?? null,
          `detection.${k}`);
      }
    }
  }

  // --- Tags validity ---
  const tagsNode = findNode(root, ['tags']);
  if (tagsNode) {
    const tags = getListItems(tagsNode);
    for (const t of tags) {
      if (!t.toLowerCase().startsWith('attack.') && !t.toLowerCase().startsWith('cve.')) {
        // info only; many tags are custom
      }
      if (/\s/.test(t)) {
        addIssue(issues, 'warning', 'SG_W_TAG_SPACE',
          `标签 "${t}" 中包含空格，建议使用点分或短横线命名`,
          tagsNode.startLine, 'tags[]');
      }
    }
  }

  // --- Final ---
  const errCount = countSeverity(issues, 'error');

  return {
    valid: errCount === 0,
    issues,
    hasTitle,
    hasLogSource,
    hasDetection,
    hasCondition,
    logSourceCategory,
    detectionKeys,
    conditionRefs,
    undefinedRefs,
  };
}
