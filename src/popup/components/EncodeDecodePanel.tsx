import React, { useState, useCallback, useEffect } from 'react';
import { usePersistentState } from '../../utils/persistent-state';
import {
  base64Encode, base64Decode,
  base32Encode, base32Decode,
  hexEncode, hexDecode,
  urlEncode, urlDecode,
  unicodeEscapeEncode, unicodeEscapeDecode,
  htmlEntityEncode, htmlEntityDecode,
  jwtDecode, multiLayerDecode,
} from '../../utils';
import type {
  ToolResult, MultiLayerDecodeResult,
} from '../../types';

interface Props {
  onAutoCopy: (text: string) => void;
}

type SubTab = 'base64' | 'base32' | 'hex' | 'url' | 'unicode' | 'html' | 'jwt' | 'multilayer';
type Direction = 'encode' | 'decode';

const SUB_TABS: { id: SubTab; label: string; hasEncode?: boolean }[] = [
  { id: 'base64', label: 'Base64', hasEncode: true },
  { id: 'base32', label: 'Base32', hasEncode: true },
  { id: 'hex', label: 'Hex', hasEncode: true },
  { id: 'url', label: 'URL', hasEncode: true },
  { id: 'unicode', label: 'Unicode', hasEncode: true },
  { id: 'html', label: 'HTML', hasEncode: true },
  { id: 'jwt', label: 'JWT' },
  { id: 'multilayer', label: '多层解码' },
];

const EncodeDecodePanel: React.FC<Props> = ({ onAutoCopy }) => {
  const [subTab, setSubTab] = usePersistentState<SubTab>('encode.subTab', 'base64');
  const [direction, setDirection] = usePersistentState<Direction>('encode.direction', 'decode');
  const [input, setInput] = usePersistentState<string>('encode.input', '');
  const [output, setOutput] = usePersistentState<string>('encode.output', '');
  const [lastLayerResult, setLastLayerResult] = usePersistentState<string>('encode.lastLayerResult', '');
  const [error, setError] = useState('');
  const [jwtResult, setJwtResult] = usePersistentState<Record<string, unknown> | null>('encode.jwtResult', null);

  const currentTab = SUB_TABS.find((t) => t.id === subTab)!;
  const isDecodeOnly = !currentTab.hasEncode;

  const exec = useCallback(() => {
    if (!input.trim()) {
      setOutput('');
      setError('');
      return;
    }
    setError('');
    setOutput('');
    setJwtResult(null);
    setLastLayerResult('');

    let result: ToolResult<unknown>;

    switch (subTab) {
      case 'base64':
        result = direction === 'encode' ? base64Encode(input) : base64Decode(input);
        break;
      case 'base32':
        result = direction === 'encode' ? base32Encode(input) : base32Decode(input);
        break;
      case 'hex':
        result = direction === 'encode' ? hexEncode(input) : hexDecode(input);
        break;
      case 'url':
        result = direction === 'encode' ? urlEncode(input) : urlDecode(input);
        break;
      case 'unicode':
        result = direction === 'encode' ? unicodeEscapeEncode(input) : unicodeEscapeDecode(input);
        break;
      case 'html':
        result = direction === 'encode' ? htmlEntityEncode(input) : htmlEntityDecode(input);
        break;
      case 'jwt': {
        result = jwtDecode(input);
        if (result.success && result.data && typeof result.data === 'object') {
          const jwtData = result.data as Record<string, unknown>;
          setJwtResult(jwtData);
          setOutput(JSON.stringify(jwtData.payload ?? jwtData, null, 2));
        }
        break;
      }
      case 'multilayer': {
        result = multiLayerDecode(input, 10);
        if (result.success) {
          const data = result.data as MultiLayerDecodeResult;
          setOutput(data.layers.map((l) => `[${l.layer}] ${l.detected}\n${l.result}`).join('\n\n'));
          if (data.layers.length > 0) {
            setLastLayerResult(data.layers[data.layers.length - 1].result);
          }
        }
        break;
      }
      default:
        return;
    }

    if (result.success) {
      const text = typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
      if (subTab !== 'jwt' && subTab !== 'multilayer') {
        setOutput(text);
      }
    } else {
      setError(result.error ?? 'Unknown error');
    }
  }, [input, subTab, direction]);

  // 输入即运行（150ms 防抖）
  useEffect(() => {
    const timer = setTimeout(exec, 150);
    return () => clearTimeout(timer);
  }, [exec]);

  const copyOutput = () => {
    const copyText = subTab === 'multilayer' ? lastLayerResult : output;
    if (copyText) {
      navigator.clipboard.writeText(copyText);
      onAutoCopy(copyText);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Sub tabs */}
      <div className="flex items-center gap-0.5 px-3 py-2 border-b border-slate-200 dark:border-slate-700 shrink-0 overflow-x-auto">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setSubTab(t.id);
              setDirection(t.hasEncode ? direction : 'decode');
              setOutput('');
              setError('');
              setJwtResult(null);
            }}
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

      {/* Encode/Decode toggle */}
      {!isDecodeOnly && (
        <div className="flex items-center px-3 pt-2 shrink-0">
          <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-md p-0.5">
            <button
              onClick={() => { setDirection('decode'); setOutput(''); setError(''); }}
              className={`text-2xs px-3 py-1 rounded transition-colors ${
                direction === 'decode'
                  ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              解码
            </button>
            <button
              onClick={() => { setDirection('encode'); setOutput(''); setError(''); }}
              className={`text-2xs px-3 py-1 rounded transition-colors ${
                direction === 'encode'
                  ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              编码
            </button>
          </div>
          {isDecodeOnly && <span />}
        </div>
      )}

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
          placeholder="在此输入文本..."
          className="flex-1 min-h-[60px] text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-slate-700 dark:text-slate-300 placeholder-slate-400 resize-none font-mono focus:ring-1 focus:ring-primary-500 outline-none"
        />
      </div>

      {/* Output */}
      <div className="flex flex-col flex-1 mx-3 mb-3 min-h-0">
        <div className="text-2xs text-slate-400 dark:text-slate-500 mb-0.5 shrink-0">输出</div>
        {subTab === 'jwt' && jwtResult ? (
          <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
            {jwtResult.header != null && (
              <div className="mb-2">
                <div className="text-2xs font-medium text-slate-500 dark:text-slate-400 mb-1">HEADER</div>
                <pre className="text-xs text-slate-700 dark:text-slate-300 font-mono whitespace-pre-wrap">{JSON.stringify(jwtResult.header, null, 2)}</pre>
              </div>
            )}
            {jwtResult.payload != null && (
              <div className="mb-2">
                <div className="text-2xs font-medium text-slate-500 dark:text-slate-400 mb-1">PAYLOAD</div>
                <pre className="text-xs text-slate-700 dark:text-slate-300 font-mono whitespace-pre-wrap">{JSON.stringify(jwtResult.payload, null, 2)}</pre>
              </div>
            )}
            {jwtResult.signature != null && (
              <div>
                <div className="text-2xs font-medium text-slate-500 dark:text-slate-400 mb-1">SIGNATURE</div>
                <pre className="text-xs text-slate-700 dark:text-slate-300 font-mono whitespace-pre-wrap break-all">{jwtResult.signature as string}</pre>
              </div>
            )}
          </div>
        ) : (
          <textarea
            readOnly
            value={output}
            className="flex-1 min-h-[60px] text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-700 dark:text-slate-300 font-mono resize-none outline-none"
          />
        )}
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

export default EncodeDecodePanel;
