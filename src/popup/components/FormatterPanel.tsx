import React, { useState, useCallback, useEffect } from 'react';
import {
  jsonFormat, jsonMinify, jsonValidate,
  jsonEscape, jsonUnescape, jsonPathQuery, jsonDiff,
  pythonLiteralFormat, sqlFormat, xmlFormat,
} from '../../utils';
import type { ToolResult, JsonPathResult, JsonDiffItem, AppSettings } from '../../types';
import JsonTree from './JsonTree';

interface Props {
  settings: AppSettings;
  onAutoCopy: (text: string) => void;
}

type SubTab = 'json' | 'python' | 'sql' | 'xml';
type JsonAction = 'format' | 'minify' | 'validate' | 'escape' | 'unescape' | 'path' | 'diff';

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'json', label: 'JSON' },
  { id: 'python', label: 'Python' },
  { id: 'sql', label: 'SQL' },
  { id: 'xml', label: 'XML' },
];

const JSON_ACTIONS: { id: JsonAction; label: string }[] = [
  { id: 'format', label: '格式化' },
  { id: 'minify', label: '压缩' },
  { id: 'validate', label: '校验' },
  { id: 'escape', label: '转义' },
  { id: 'unescape', label: '反转义' },
  { id: 'path', label: 'Path' },
  { id: 'diff', label: 'Diff' },
];

const FormatterPanel: React.FC<Props> = ({ settings, onAutoCopy }) => {
  const [subTab, setSubTab] = useState<SubTab>('json');
  const [jsonAction, setJsonAction] = useState<JsonAction>('format');
  const [input, setInput] = useState('');
  const [inputRight, setInputRight] = useState('');
  const [jsonPath, setJsonPath] = useState('');
  const [output, setOutput] = useState('');
  const [parsedJson, setParsedJson] = useState<unknown>(null);
  const [error, setError] = useState('');
  const [expandInput, setExpandInput] = useState(true);
  const [expandOutput, setExpandOutput] = useState(true);

  const exec = useCallback(() => {
    if (!input.trim()) {
      setError('');
      setOutput('');
      return;
    }
    setError('');
    setOutput('');

    let result: ToolResult<unknown>;

    switch (subTab) {
      case 'json':
        switch (jsonAction) {
          case 'format':
            result = jsonFormat(input, settings.indentSize);
            break;
          case 'minify':
            result = jsonMinify(input);
            break;
          case 'validate':
            result = jsonValidate(input);
            break;
          case 'escape':
            result = jsonEscape(input);
            break;
          case 'unescape':
            result = jsonUnescape(input);
            break;
          case 'path': {
            if (!jsonPath.trim()) { setError('请输入 JSON Path'); return; }
            result = jsonPathQuery(input, jsonPath);
            break;
          }
          case 'diff': {
            if (!inputRight.trim()) { setError('请输入右侧 JSON'); return; }
            result = jsonDiff(input, inputRight);
            break;
          }
          default:
            return;
        }
        break;

      case 'python':
        result = pythonLiteralFormat(input, settings.indentSize);
        break;

      case 'sql':
        result = sqlFormat(input);
        break;

      case 'xml':
        result = xmlFormat(input, settings.indentSize);
        break;

      default:
        return;
    }

    if (result.success) {
      const data = result.data;
      let text: string;

      if (subTab === 'json' && jsonAction === 'validate') {
        const v = data as { valid: boolean; line: number; column: number; message: string };
        text = v.valid
          ? '✓ 有效的 JSON'
          : `✗ 第 ${v.line} 行, 第 ${v.column} 列: ${v.message}`;
      } else if (subTab === 'json' && jsonAction === 'path') {
        text = (data as JsonPathResult[]).map((r) => `${r.path}: ${r.value}`).join('\n');
      } else if (subTab === 'json' && jsonAction === 'diff') {
        text = (data as JsonDiffItem[]).map((d) =>
          `${d.type === 'added' ? '+' : d.type === 'removed' ? '-' : '~'} ${d.path}${
            d.type === 'changed' ? `\n  - ${d.oldValue}\n  + ${d.newValue}`
            : d.type === 'added' ? `\n  + ${d.newValue}` : `\n  - ${d.oldValue}`
          }`
        ).join('\n');
      } else {
        text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      }

      setOutput(text);
      if (subTab === 'json' && jsonAction === 'format') {
        try {
          setParsedJson(JSON.parse(text));
        } catch {
          setParsedJson(null);
        }
      } else {
        setParsedJson(null);
      }
    } else {
      setError(result.error ?? 'Unknown error');
      setParsedJson(null);
    }
  }, [input, inputRight, jsonPath, subTab, jsonAction, settings, onAutoCopy]);

  // 输入即运行（150ms 防抖）
  useEffect(() => {
    const timer = setTimeout(() => {
      if (input.trim()) exec();
    }, 150);
    return () => clearTimeout(timer);
  }, [exec]);

  const copyOutput = () => {
    if (output) {
      navigator.clipboard.writeText(output);
      onAutoCopy(output);
    }
  };

  const isDiff = subTab === 'json' && jsonAction === 'diff';

  return (
    <div className="flex flex-col h-full">
      {/* Sub tabs */}
      <div className="flex items-center gap-0.5 px-3 py-2 border-b border-slate-200 dark:border-slate-700 shrink-0">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => { setSubTab(t.id); setOutput(''); setError(''); setJsonAction('format'); }}
            className={`text-2xs px-2.5 py-1 rounded-md whitespace-nowrap transition-colors ${
              subTab === t.id
                ? 'bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 font-medium'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* JSON action sub-tabs */}
      {subTab === 'json' && (
        <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 overflow-x-auto shrink-0">
          {JSON_ACTIONS.map((a) => (
            <button
              key={a.id}
              onClick={() => { setJsonAction(a.id); setOutput(''); setError(''); }}
              className={`text-2xs px-2 py-0.5 rounded transition-colors whitespace-nowrap ${
                jsonAction === a.id
                  ? 'bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 font-medium'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      {/* JSON Path input */}
      {subTab === 'json' && jsonAction === 'path' && (
        <input
          type="text"
          value={jsonPath}
          onChange={(e) => setJsonPath(e.target.value)}
          placeholder='JSON Path, e.g. $.store.book[*].title'
          className="mx-3 mb-2 text-2xs rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-2 py-1 text-slate-700 dark:text-slate-300 placeholder-slate-400 outline-none focus:ring-1 focus:ring-primary-500 shrink-0"
        />
      )}

      {/* Error */}
      {error && (
        <div className="mx-3 mb-2 text-2xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md px-3 py-1.5 shrink-0">
          {error}
        </div>
      )}

      {/* Input + Output body — for diff, output is larger; otherwise equal */}
      <div className="flex-1 flex flex-col mx-3 mb-3 min-h-0 gap-1.5">
        {/* Input */}
        <div className={`flex flex-col min-h-0 ${isDiff ? 'shrink-0' : 'flex-1'}`}>
          <div className="flex items-center justify-between mb-0.5 shrink-0">
            <button
              onClick={() => setExpandInput(!expandInput)}
              className="flex items-center gap-1 text-2xs text-slate-400 dark:text-slate-500 hover:text-slate-600"
            >
              <span className={`text-[10px] transition-transform ${expandInput ? 'rotate-90' : ''}`}>▶</span>
              输入
            </button>
          </div>
          {expandInput && (
            isDiff ? (
              <div className="flex gap-2 shrink-0">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="左侧 JSON..."
                  rows={5}
                  className="flex-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-slate-700 dark:text-slate-300 placeholder-slate-400 resize-none font-mono focus:ring-1 focus:ring-primary-500 outline-none"
                />
                <textarea
                  value={inputRight}
                  onChange={(e) => setInputRight(e.target.value)}
                  placeholder="右侧 JSON..."
                  rows={5}
                  className="flex-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-slate-700 dark:text-slate-300 placeholder-slate-400 resize-none font-mono focus:ring-1 focus:ring-primary-500 outline-none"
                />
              </div>
            ) : (
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="输入文本..."
                className="flex-1 min-h-[60px] text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-slate-700 dark:text-slate-300 placeholder-slate-400 resize-none font-mono focus:ring-1 focus:ring-primary-500 outline-none"
              />
            )
          )}
        </div>

        {/* Output */}
        <div className={`flex flex-col min-h-0 ${isDiff ? 'flex-1' : 'flex-1'}`}>
          <div className="flex items-center justify-between mb-0.5 shrink-0">
            <button
              onClick={() => setExpandOutput(!expandOutput)}
              className="flex items-center gap-1 text-2xs text-slate-400 dark:text-slate-500 hover:text-slate-600"
            >
              <span className={`text-[10px] transition-transform ${expandOutput ? 'rotate-90' : ''}`}>▶</span>
              输出
            </button>
          </div>
          {expandOutput && (
            subTab === 'json' && jsonAction === 'format' && parsedJson !== null ? (
              <JsonTree data={parsedJson} />
            ) : (
              <textarea
                readOnly
                value={output}
                className="flex-1 min-h-[60px] text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-700 dark:text-slate-300 font-mono resize-none outline-none"
              />
            )
          )}
          {output && (
            <button onClick={copyOutput} className="mt-1.5 self-end text-2xs px-3 py-1 bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-500/20 rounded-md transition-colors">
              复制
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FormatterPanel;
