// ============================================================
// yara-lint 轻量校验器
// 基于语法特征的静态检查，不依赖第三方库
// 覆盖：规则结构、字符串声明、条件表达式、常见陷阱
// ============================================================

import type {
  YaraLintIssue,
  YaraLintResult,
  YaraLintSeverity,
  YaraRuleInfo,
} from '../types/regex-yara-sigma';

interface LineInfo {
  idx: number;
  line: string;
  stripped: string;
  lineNo: number;
}

const KNOWN_META_KEYS = new Set([
  'author', 'description', 'date', 'updated', 'version',
  'reference', 'references', 'source', 'url', 'license',
  'severity', 'category', 'classification', 'tags',
  'id', 'rule_id', 'malware', 'threat', 'mitre', 'mitre_attack',
]);

function splitLines(source: string): LineInfo[] {
  return source.split(/\r?\n/).map((line, idx) => ({
    idx,
    line,
    stripped: line.trim(),
    lineNo: idx + 1,
  }));
}

function addIssue(
  issues: YaraLintIssue[],
  severity: YaraLintSeverity,
  code: string,
  message: string,
  line: number | null = null,
  column: number | null = null,
  suggestion?: string,
) {
  issues.push({ severity, line, column, code, message, suggestion });
}

function countSeverity(issues: YaraLintIssue[], s: YaraLintSeverity): number {
  return issues.filter((i) => i.severity === s).length;
}

function stripCommentsAndStrings(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    // Line comment
    if (ch === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    // Block comment
    if (ch === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    // String literal
    if (ch === '"') {
      out += '""';
      i++;
      while (i < src.length) {
        if (src[i] === '\\' && i + 1 < src.length) { i += 2; continue; }
        if (src[i] === '"') { i++; break; }
        i++;
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

export function lintYara(source: string): YaraLintResult {
  const issues: YaraLintIssue[] = [];
  const lines = splitLines(source);
  const rules: YaraRuleInfo[] = [];

  let current: YaraRuleInfo | null = null;
  let section: 'none' | 'meta' | 'strings' | 'condition' = 'none';
  let braceDepth = 0;

  const ruleNameRe = /^\s*(?:private\s+|global\s+)*rule\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*([A-Za-z0-9_\s,]+))?\{?\s*$/;
  const metaKeyRe = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$/;
  const strDeclRe = /^\s*\$([A-Za-z0-9_]*)\s*(?:=\s*)?(.*)$/;
  const sectionHeadRe = /^\s*(meta|strings|condition)\s*:\s*$/i;

  // ---- Top-level scan for section / structure ----
  for (const ln of lines) {
    const { stripped, lineNo } = ln;
    if (!stripped || stripped.startsWith('//')) continue;

    // Block comment only line
    if (/^\/\*[\s\S]*\*\/$/.test(stripped)) continue;

    // Rule declaration
    if (/^\s*(?:private\s+|global\s+)*rule\s+/i.test(stripped)) {
      const m = stripped.match(ruleNameRe);
      if (current && braceDepth > 0) {
        addIssue(issues, 'error', 'YR_E_UNCLOSED_RULE',
          `规则 "${current.name ?? '<unnamed>'}" 未正确闭合`, lineNo);
      }
      current = {
        name: m?.[1] ?? null,
        tags: m?.[2]
          ? m[2].split(',').map((t) => t.trim()).filter(Boolean)
          : [],
        metaEntries: [],
        strings: [],
        condition: null,
        conditionLine: null,
      };
      rules.push(current);
      section = 'none';
      braceDepth = 0;
      if (!m) {
        addIssue(issues, 'error', 'YR_E_RULE_NAME',
          '规则声明格式错误，应为 "rule <Name> {:?}"', lineNo);
      } else {
        const rn = m[1];
        if (rn.length > 128) {
          addIssue(issues, 'warning', 'YR_W_LONG_NAME',
            `规则名 "${rn}" 过长（${rn.length} 字符），建议 ≤64`, lineNo);
        }
        if (/\d/.test(rn[0])) {
          addIssue(issues, 'error', 'YR_E_RULE_NAME',
            `规则名 "${rn}" 不能以数字开头`, lineNo);
        }
        if (current.tags.some((t) => !t)) {
          addIssue(issues, 'warning', 'YR_W_EMPTY_TAG',
            '规则标签列表中存在空项', lineNo);
        }
      }
    }

    // Section header
    const sh = stripped.match(sectionHeadRe);
    if (sh) {
      section = sh[1].toLowerCase() as 'meta' | 'strings' | 'condition';
      continue;
    }

    // Count braces for rudimentary nesting (ignores braces inside strings)
    const strippedClean = stripCommentsAndStrings(stripped);
    for (const ch of strippedClean) {
      if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
    }

    if (!current) continue;

    // Meta entries
    if (section === 'meta') {
      const mm = stripped.match(metaKeyRe);
      if (mm) {
        const [, key, value] = mm;
        const trimmedVal = value.trim();
        const isString = /^".*"$/.test(trimmedVal);
        const isInt = /^-?\d+$/.test(trimmedVal);
        const isBool = /^(true|false)$/i.test(trimmedVal);
        if (!(isString || isInt || isBool)) {
          addIssue(issues, 'warning', 'YR_W_META_VALUE',
            `meta "${key}" 的值格式可疑：${trimmedVal}（应为字符串/数字/布尔）`, lineNo);
        }
        if (!KNOWN_META_KEYS.has(key.toLowerCase())) {
          addIssue(issues, 'info', 'YR_I_META_KEY',
            `meta 键 "${key}" 不在常见推荐字段集合中`, lineNo, null,
            '推荐 author/description/date/version/reference/severity 等');
        }
        if (key.toLowerCase() === 'description' && isString) {
          const len = trimmedVal.length - 2;
          if (len < 10) {
            addIssue(issues, 'warning', 'YR_W_SHORT_DESC',
              'description 过短，应清楚描述规则用途与触发场景', lineNo);
          }
        }
        current.metaEntries.push({ key, value: trimmedVal, line: lineNo });
      }
    }

    // String declarations
    if (section === 'strings') {
      const sm = stripped.match(strDeclRe);
      if (sm) {
        const [, id, rest] = sm;
        if (rest && !rest.startsWith('//')) {
          const val = rest.trim();
          let type: 'text' | 'hex' | 'regex' = 'text';
          if (val.startsWith('{') && val.endsWith('}')) type = 'hex';
          else if (val.startsWith('/')) type = 'regex';
          else if (!val.startsWith('"')) {
            // Still count but warn
            addIssue(issues, 'warning', 'YR_W_STRING_FMT',
              `字符串 $${id} 值格式可疑，应用双引号 / {hex} / /regex/`, lineNo);
          }
          current.strings.push({ id, type, value: val, line: lineNo });

          // Check common modifiers are valid keywords
          const modPart = val.endsWith('"') ? rest.slice(rest.lastIndexOf('"') + 1) : '';
          const mods = modPart.split(/\s+/).filter(Boolean);
          const validMods = new Set(['ascii', 'wide', 'fullword', 'nocase', 'xor', 'base64', 'base64wide', 'private']);
          for (const mod of mods) {
            const clean = mod.split('(')[0].toLowerCase();
            if (clean && !validMods.has(clean)) {
              addIssue(issues, 'warning', 'YR_W_STRING_MOD',
                `未知字符串修饰符 "${mod}"`, lineNo);
            }
          }
          if (type === 'regex') {
            const lastSlash = val.lastIndexOf('/');
            if (lastSlash > 0) {
              const inner = val.slice(1, lastSlash);
              try {
                new RegExp(inner);
              } catch (e) {
                addIssue(issues, 'error', 'YR_E_REGEX',
                  `正则字符串语法错误: ${e instanceof Error ? e.message : String(e)}`, lineNo);
              }
            }
          }
          if (type === 'hex') {
            const inner = val.slice(1, -1);
            if (/[^0-9a-fA-F?\s\-|!()[\]{}]/.test(inner)) {
              addIssue(issues, 'warning', 'YR_W_HEX_CHAR',
                `hex 字符串中存在非法字符，仅允许 0-9 a-f ? - | ! ( ) [ ] { } 及空白`, lineNo);
            }
          }
        }
      }
    }

    // Condition
    if (section === 'condition' && stripped && !stripped.startsWith('}')) {
      if (current.condition == null) {
        current.condition = stripped;
        current.conditionLine = lineNo;
      } else {
        current.condition += '\n' + stripped;
      }
    }
  }

  if (current && braceDepth > 0) {
    addIssue(issues, 'error', 'YR_E_UNCLOSED_RULE',
      `规则 "${current.name ?? '<unnamed>'}" 缺少闭合大括号 }`,
      lines.length > 0 ? lines[lines.length - 1].lineNo : null);
  }

  // ---- Rule-level validations ----
  if (rules.length === 0) {
    if (source.trim()) {
      addIssue(issues, 'error', 'YR_E_NO_RULE',
        '未检测到有效的 YARA 规则声明，应以 "rule <Name> {" 开头', 1);
    }
  }

  let totalMeta = 0;
  let totalStrings = 0;
  let rulesWithCondition = 0;

  for (const r of rules) {
    totalMeta += r.metaEntries.length;
    totalStrings += r.strings.length;
    if (r.condition != null) rulesWithCondition++;

    const rname = r.name ?? '<unnamed>';
    const rline = r.strings[0]?.line ?? r.metaEntries[0]?.line ?? r.conditionLine ?? null;

    // 至少要有描述
    const hasDesc = r.metaEntries.some((m) => m.key.toLowerCase() === 'description');
    if (!hasDesc) {
      addIssue(issues, 'warning', 'YR_W_NO_DESC',
        `规则 "${rname}" 缺少 description 元数据`, rline, null,
        '建议 meta: description = "规则用途与触发条件"');
    }
    // 推荐 author
    const hasAuthor = r.metaEntries.some((m) => m.key.toLowerCase() === 'author');
    if (!hasAuthor) {
      addIssue(issues, 'info', 'YR_I_NO_AUTHOR',
        `规则 "${rname}" 缺少 author 元数据`, rline);
    }

    // 必须有条件
    if (r.condition == null || r.condition.trim() === '') {
      addIssue(issues, 'error', 'YR_E_NO_CONDITION',
        `规则 "${rname}" 缺少 condition 段`, rline);
    } else {
      // 条件内 self-checks
      const cond = r.condition;

      // 条件中引用的 $string / #string / @string
      const usedIds = new Set<string>();
      const refs = cond.match(/[$#@][A-Za-z0-9_]*/g);
      if (refs) refs.forEach((r2) => usedIds.add(r2.slice(1)));

      // Allow anonymous "$"
      usedIds.delete('');

      // String-id must exist if used (exclude "them" + any/all of construct)
      const hasStringsDecl = r.strings.length > 0;
      const declaredIds = new Set(r.strings.map((s) => s.id));

      for (const uid of usedIds) {
        if (!declaredIds.has(uid)) {
          addIssue(issues, 'error', 'YR_E_UNDEF_STRING',
            `规则 "${rname}" 的 condition 引用了未声明的字符串标识符 $${uid}`,
            r.conditionLine);
        }
      }

      // 声明了字符串但完全没引用
      if (hasStringsDecl) {
        const condPlain = cond.toLowerCase();
        const anyThem = /\b(any|all)\s+of\s+them\b/.test(condPlain);
        const forAll = /\bfor\s+(any|all)\s+of\s+(them|\([^)]*\))\s*:/.test(condPlain);
        if (!anyThem && !forAll) {
          for (const s of r.strings) {
            if (!usedIds.has(s.id)) {
              addIssue(issues, 'warning', 'YR_W_UNUSED_STRING',
                `规则 "${rname}" 中的字符串 $${s.id} 未在 condition 中引用`, s.line);
            }
          }
        }
      } else {
        // 没有字符串声明但条件里使用字符串相关操作
        if (/\$|#|@/.test(cond)) {
          addIssue(issues, 'warning', 'YR_W_NO_STRINGS',
            `规则 "${rname}" 未声明字符串，但 condition 中出现 $/#/@ 引用`,
            r.conditionLine);
        }
      }

      // "any of them" 但未声明字符串
      if (/any\s+of\s+them|all\s+of\s+them/i.test(cond) && r.strings.length === 0) {
        addIssue(issues, 'error', 'YR_E_ANY_THEM_EMPTY',
          `规则 "${rname}" 使用了 "any/all of them" 但未声明任何字符串`,
          r.conditionLine);
      }

      // 空 condition body（纯 true/false 虽合法但可疑）
      if (cond.trim().length < 3) {
        addIssue(issues, 'warning', 'YR_W_TRIVIAL_COND',
          `规则 "${rname}" 的 condition 过于简短，可能误报或无法触发`,
          r.conditionLine);
      }

      // 括号不平衡（简化计数，去除字符串）
      const bare = stripCommentsAndStrings(cond);
      let paren = 0;
      for (const ch of bare) {
        if (ch === '(') paren++;
        else if (ch === ')') paren--;
      }
      if (paren !== 0) {
        addIssue(issues, 'error', 'YR_E_PAREN_MISMATCH',
          `规则 "${rname}" 的 condition 圆括号不平衡（${paren > 0 ? '缺少 ' + paren + ' 个 )' : '多余 ' + -paren + ' 个 )'}）`,
          r.conditionLine);
      }
    }

    // Duplicate string ids within rule
    const idMap = new Map<string, number>();
    for (const s of r.strings) {
      if (idMap.has(s.id)) {
        addIssue(issues, 'error', 'YR_E_DUP_STRING_ID',
          `规则 "${rname}" 中字符串标识符 $${s.id} 重复声明`, s.line);
      } else {
        idMap.set(s.id, s.line);
      }
    }

    // 空字符串
    for (const s of r.strings) {
      if (s.type === 'text') {
        if (s.value === '""' || s.value === '"') {
          addIssue(issues, 'warning', 'YR_W_EMPTY_TEXT',
            `规则 "${rname}" 中 $${s.id} 为空文本字符串，将匹配任何位置`, s.line);
        }
      }
    }
  }

  // ---- Global scan: suspicious patterns ----
  for (const ln of lines) {
    const { stripped, lineNo, line } = ln;
    if (!stripped) continue;
    // Tab indent vs spaces (warn if mixed)
    if (/\t/.test(line) && /^ +/.test(line)) {
      addIssue(issues, 'info', 'YR_I_MIXED_INDENT',
        '同一行混用 Tab 与空格缩进，建议统一', lineNo);
      break;
    }
    // Trailing whitespace
    if (/\s+$/.test(line)) {
      // only report once to avoid spam
    }
    // Long line
    if (line.length > 200) {
      addIssue(issues, 'info', 'YR_I_LONG_LINE',
        `第 ${lineNo} 行超过 200 字符（${line.length}），建议拆分`, lineNo);
    }
  }

  const errCount = countSeverity(issues, 'error');

  return {
    valid: errCount === 0,
    issues,
    ruleCount: rules.length,
    metaCount: totalMeta,
    stringsCount: totalStrings,
    hasCondition: rulesWithCondition === rules.length && rules.length > 0,
  };
}
