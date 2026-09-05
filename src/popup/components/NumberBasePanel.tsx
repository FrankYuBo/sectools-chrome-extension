import React, { useState, useCallback, useEffect, useRef } from 'react';
import { usePersistentState } from '../../utils/persistent-state';
import { quickConvert, textToBinaryView } from '../../utils';
import type { ToolResult, QuickConversion } from '../../types';

interface Props {
  onAutoCopy: (text: string) => void;
}

type SubTab = 'convert' | 'textview';
type NumberBase = 'bin' | 'oct' | 'dec' | 'hex';

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'convert', label: '数值转换' },
  { id: 'textview', label: 'Hex查看' },
];

const BASE_OPTIONS: { value: NumberBase; label: string }[] = [
  { value: 'hex', label: '十六进制' },
  { value: 'dec', label: '十进制' },
  { value: 'oct', label: '八进制' },
  { value: 'bin', label: '二进制' },
];

const NumberBasePanel: React.FC<Props> = ({ onAutoCopy }) => {
  const [subTab, setSubTab] = usePersistentState<SubTab>('num.subTab', 'convert');
  const [input, setInput] = usePersistentState<string>('num.input', '');
  const [sourceBase, setSourceBase] = usePersistentState<NumberBase>('num.sourceBase', 'hex');
  const [output, setOutput] = usePersistentState<string>('num.output', '');
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const exec = useCallback(() => {
    if (!input.trim()) {
      setOutput('');
      setError('');
      return;
    }
    setError('');
    setOutput('');

    if (subTab === 'convert') {
      const fromBase = sourceBase === 'bin' ? 2 : sourceBase === 'oct' ? 8 : sourceBase === 'dec' ? 10 : 16 as 2 | 8 | 10 | 16;
      const result: ToolResult<QuickConversion> = quickConvert(input, fromBase);
      if (result.success && result.data) {
        const data = result.data;
        setOutput(
          `二进制: ${data.bin}\n八进制: ${data.oct}\n十进制: ${data.dec}\n十六进制: ${data.hex}`
        );
      } else {
        setError(result.error ?? 'Unknown error');
      }
    } else {
      // Hex 查看器
      const result = textToBinaryView(input, 'both');
      if (result.success && result.data) {
        setOutput(`Hex: ${result.data.hex}\nBinary: ${result.data.binary}`);
      } else {
        setError(result.error ?? 'Unknown error');
      }
    }
  }, [input, subTab, sourceBase]);

  // 输入即运行（300ms 防抖）
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(exec, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [exec]);

  const copyOutput = () => {
    if (output) {
      navigator.clipboard.writeText(output);
      onAutoCopy(output);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Sub tabs */}
      <div className="flex items-center gap-0.5 px-3 py-2 border-b border-slate-200 dark:border-slate-700 shrink-0">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => { setSubTab(t.id); setOutput(''); setError(''); }}
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

      {/* Source base selector */}
      {subTab === 'convert' && (
        <div className="flex items-center gap-2 px-3 pt-2 shrink-0">
          <span className="text-2xs text-slate-500 dark:text-slate-400">源进制:</span>
          <select
            value={sourceBase}
            onChange={(e) => { setSourceBase(e.target.value as NumberBase); setOutput(''); }}
            className="text-2xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-slate-700 dark:text-slate-300"
          >
            {BASE_OPTIONS.map((b) => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
        </div>
      )}

      {subTab !== 'textview' && subTab !== 'convert' && <span />}

      {/* Error */}
      {error && (
        <div className="mx-3 mb-2 text-2xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md px-3 py-1.5 shrink-0">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="flex flex-col flex-1 mx-3 mb-2 min-h-0">
        <div className="text-2xs text-slate-400 dark:text-slate-500 mb-0.5 shrink-0">输入</div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={subTab === 'convert' ? '输入数值...' : '输入文本...'}
          className="flex-1 min-h-[60px] text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-slate-700 dark:text-slate-300 placeholder-slate-400 resize-none font-mono focus:ring-1 focus:ring-primary-500 outline-none"
        />
      </div>

      {/* Output */}
      <div className="flex flex-col flex-1 mx-3 mb-3 min-h-0">
        <div className="text-2xs text-slate-400 dark:text-slate-500 mb-0.5 shrink-0">输出</div>
        <textarea
          readOnly
          value={output}
          className="flex-1 min-h-[60px] text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-700 dark:text-slate-300 font-mono resize-none outline-none"
        />
        {output && (
          <button
            onClick={copyOutput}
            className="mt-1.5 self-end text-2xs px-3 py-1 bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-500/20 rounded-md transition-colors"
          >
            复制
          </button>
        )}
      </div>
    </div>
  );
};

export default NumberBasePanel;
