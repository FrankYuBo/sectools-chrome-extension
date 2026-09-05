import React, { useState, useCallback, useEffect, useRef } from 'react';
import { usePersistentState } from '../../utils/persistent-state';
import { computeHash, computeHMAC, aesEncrypt, aesDecrypt } from '../../utils';
import type { ToolResult, HashAlgorithm, AesMode } from '../../types';

interface Props {
  onAutoCopy: (text: string) => void;
}

type SubTab = 'hash' | 'hmac' | 'aes';

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'hash', label: '哈希' },
  { id: 'hmac', label: 'HMAC' },
  { id: 'aes', label: 'AES' },
];

const HASH_LIST: HashAlgorithm[] = ['MD5', 'SHA-1', 'SHA-256', 'SHA-512'];
const AES_MODES: AesMode[] = ['GCM', 'CBC'];

const CryptoHashPanel: React.FC<Props> = ({ onAutoCopy }) => {
  const [subTab, setSubTab] = usePersistentState<SubTab>('crypto.subTab', 'hash');
  const [input, setInput] = usePersistentState<string>('crypto.input', '');
  const [key, setKey] = usePersistentState<string>('crypto.key', '');
  const [algorithm, setAlgorithm] = usePersistentState<HashAlgorithm>('crypto.algorithm', 'SHA-256');
  const [aesMode, setAesMode] = usePersistentState<AesMode>('crypto.aesMode', 'CBC');
  const [aesDirection, setAesDirection] = usePersistentState<'encrypt' | 'decrypt'>('crypto.aesDirection', 'encrypt');
  const [output, setOutput] = usePersistentState<string>('crypto.output', '');
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const exec = useCallback(async () => {
    if (!input.trim()) {
      setOutput('');
      setError('');
      return;
    }
    setError('');
    setOutput('');

    let result: ToolResult<unknown>;

    try {
      switch (subTab) {
        case 'hash':
          result = await computeHash(input, algorithm);
          break;
        case 'hmac':
          if (!key.trim()) { setError('请输入密钥'); return; }
          result = await computeHMAC(input, key, algorithm);
          break;
        case 'aes':
          if (!key.trim()) { setError('请输入密钥'); return; }
          result = aesDirection === 'encrypt'
            ? await aesEncrypt(input, key, aesMode)
            : await aesDecrypt(input, key, aesMode);
          break;
        default:
          return;
      }
    } catch (e) {
      setError(String(e));
      return;
    }

    if (result.success) {
      setOutput(typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2));
    } else {
      setError(result.error ?? 'Unknown error');
    }
  }, [input, key, subTab, algorithm, aesMode, aesDirection]);

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

      {/* Controls */}
      <div className="flex items-center gap-2 px-3 pt-2 shrink-0 flex-wrap">
        {subTab !== 'aes' && (
          <select
            value={algorithm}
            onChange={(e) => { setAlgorithm(e.target.value as HashAlgorithm); setOutput(''); }}
            className="text-2xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-slate-700 dark:text-slate-300"
          >
            {HASH_LIST.map((a) => (
              <option key={a} value={a}>{a.toUpperCase()}</option>
            ))}
          </select>
        )}

        {subTab === 'aes' && (
          <>
            <select
              value={aesMode}
              onChange={(e) => { setAesMode(e.target.value as AesMode); setOutput(''); }}
              className="text-2xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-slate-700 dark:text-slate-300"
            >
              {AES_MODES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-md p-0.5">
              <button
                onClick={() => { setAesDirection('encrypt'); setOutput(''); }}
                className={`text-2xs px-2.5 py-0.5 rounded transition-colors ${
                  aesDirection === 'encrypt'
                    ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                加密
              </button>
              <button
                onClick={() => { setAesDirection('decrypt'); setOutput(''); }}
                className={`text-2xs px-2.5 py-0.5 rounded transition-colors ${
                  aesDirection === 'decrypt'
                    ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                解密
              </button>
            </div>
          </>
        )}

        {(subTab === 'hmac' || subTab === 'aes') && (
          <input
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="密钥"
            className="text-2xs rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-2 py-1 text-slate-700 dark:text-slate-300 placeholder-slate-400 outline-none focus:ring-1 focus:ring-primary-500 min-w-[80px]"
          />
        )}
      </div>

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

export default CryptoHashPanel;
