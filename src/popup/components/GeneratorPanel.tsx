import React, { useState, useCallback } from 'react';
import { usePersistentState } from '../../utils/persistent-state';
import {
  generateUuid,
  generatePassword,
  generateRandomString,
  generateRandomInt,
  generateRandomBytes,
} from '../../utils';
import type { UuidVersion, PasswordOptions } from '../../utils';
import type { AppSettings } from '../../types';

interface Props {
  settings: AppSettings;
  onAutoCopy: (text: string) => void;
}

type SubTab = 'uuid' | 'password' | 'string' | 'int' | 'bytes';

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'uuid', label: 'UUID' },
  { id: 'password', label: '密码' },
  { id: 'string', label: '随机串' },
  { id: 'int', label: '随机整数' },
  { id: 'bytes', label: '随机字节' },
];

const GeneratorPanel: React.FC<Props> = ({ onAutoCopy }) => {
  const [subTab, setSubTab] = usePersistentState<SubTab>('gen.subTab', 'uuid');
  const [output, setOutput] = usePersistentState<string>('gen.output', '');
  const [error, setError] = useState('');

  // UUID
  const [uuidVersion, setUuidVersion] = usePersistentState<UuidVersion>('gen.uuidVersion', 'v4');
  const [uuidCount, setUuidCount] = usePersistentState<number>('gen.uuidCount', 1);
  const [uuidLower, setUuidLower] = usePersistentState<boolean>('gen.uuidLower', true);

  // Password
  const [pwLen, setPwLen] = usePersistentState<number>('gen.pwLen', 16);
  const [pwLower, setPwLower] = usePersistentState<boolean>('gen.pwLower', true);
  const [pwUpper, setPwUpper] = usePersistentState<boolean>('gen.pwUpper', true);
  const [pwDigits, setPwDigits] = usePersistentState<boolean>('gen.pwDigits', true);
  const [pwSym, setPwSym] = usePersistentState<boolean>('gen.pwSym', true);
  const [pwNoAmb, setPwNoAmb] = usePersistentState<boolean>('gen.pwNoAmb', true);

  // Random string
  const [strLen, setStrLen] = usePersistentState<number>('gen.strLen', 24);
  const [strCharset, setStrCharset] = usePersistentState<'alphanumeric' | 'alphabetic' | 'numeric' | 'hex' | 'all'>('gen.strCharset', 'alphanumeric');

  // Random int
  const [intMin, setIntMin] = usePersistentState<number>('gen.intMin', 0);
  const [intMax, setIntMax] = usePersistentState<number>('gen.intMax', 100);

  // Random bytes
  const [byteCount, setByteCount] = useState(16);

  const copy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    onAutoCopy(text);
  }, [onAutoCopy]);

  const generate = useCallback(() => {
    setError('');
    setOutput('');
    const emit = (r: { success: boolean; data: string; error: string | null }) => {
      if (r.success) {
        setOutput(r.data);
      } else {
        setError(r.error ?? '生成失败');
      }
    };
    switch (subTab) {
      case 'uuid': {
        const n = Math.min(Math.max(uuidCount, 1), 100);
        const parts: string[] = [];
        for (let i = 0; i < n; i++) {
          const res = generateUuid(uuidVersion);
          if (!res.success) { setError(res.error ?? '生成失败'); return; }
          parts.push(uuidLower ? res.data.toLowerCase() : res.data.toUpperCase());
        }
        setOutput(parts.join('\n'));
        break;
      }
      case 'password': {
        const opts: PasswordOptions = {
          length: pwLen, lower: pwLower, upper: pwUpper, digits: pwDigits, symbols: pwSym, excludeAmbiguous: pwNoAmb,
        };
        emit(generatePassword(opts));
        break;
      }
      case 'string':
        emit(generateRandomString(strLen, strCharset));
        break;
      case 'int': {
        const res = generateRandomInt(intMin, intMax);
        if (res.success) {
          setOutput(String(res.data));
        } else {
          setError(res.error ?? '生成失败');
        }
        break;
      }
      case 'bytes':
        emit(generateRandomBytes(byteCount));
        break;
    }
  }, [subTab, uuidVersion, uuidCount, uuidLower, pwLen, pwLower, pwUpper, pwDigits, pwSym, pwNoAmb, strLen, strCharset, intMin, intMax, byteCount]);

  const checkbox = (
    label: string, checked: boolean, onChange: (v: boolean) => void,
  ) => (
    <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-primary-500" />
      {label}
    </label>
  );

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

      {/* Options */}
      <div className="px-3 py-3 space-y-2.5 overflow-auto shrink-0">
        {subTab === 'uuid' && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-2xs text-slate-400 w-14 shrink-0">版本</span>
              <select value={uuidVersion} onChange={(e) => setUuidVersion(e.target.value as UuidVersion)}
                className="text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-slate-700 dark:text-slate-300">
                <option value="v4">v4 (随机)</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xs text-slate-400 w-14 shrink-0">数量</span>
              <input type="number" min={1} max={100} value={uuidCount} onChange={(e) => setUuidCount(Number(e.target.value))}
                className="text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 w-24 text-slate-700 dark:text-slate-300" />
            </div>
            {checkbox('小写输出', uuidLower, setUuidLower)}
          </>
        )}

        {subTab === 'password' && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-2xs text-slate-400 w-14 shrink-0">长度</span>
              <input type="number" min={1} max={256} value={pwLen} onChange={(e) => setPwLen(Number(e.target.value))}
                className="text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 w-24 text-slate-700 dark:text-slate-300" />
            </div>
            {checkbox('小写字母 a-z', pwLower, setPwLower)}
            {checkbox('大写字母 A-Z', pwUpper, setPwUpper)}
            {checkbox('数字 0-9', pwDigits, setPwDigits)}
            {checkbox('符号 !@#$…', pwSym, setPwSym)}
            {checkbox('排除易混淆字符 (0 O 1 l I)', pwNoAmb, setPwNoAmb)}
          </>
        )}

        {subTab === 'string' && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-2xs text-slate-400 w-14 shrink-0">长度</span>
              <input type="number" min={1} max={4096} value={strLen} onChange={(e) => setStrLen(Number(e.target.value))}
                className="text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 w-24 text-slate-700 dark:text-slate-300" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xs text-slate-400 w-14 shrink-0">字符集</span>
              <select value={strCharset} onChange={(e) => setStrCharset(e.target.value as typeof strCharset)}
                className="text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-slate-700 dark:text-slate-300">
                <option value="alphanumeric">字母+数字</option>
                <option value="alphabetic">仅字母</option>
                <option value="numeric">仅数字</option>
                <option value="hex">十六进制</option>
                <option value="all">全部(含符号)</option>
              </select>
            </div>
          </>
        )}

        {subTab === 'int' && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-2xs text-slate-400 w-14 shrink-0">下界</span>
              <input type="number" value={intMin} onChange={(e) => setIntMin(Number(e.target.value))}
                className="text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 w-24 text-slate-700 dark:text-slate-300" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xs text-slate-400 w-14 shrink-0">上界</span>
              <input type="number" value={intMax} onChange={(e) => setIntMax(Number(e.target.value))}
                className="text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 w-24 text-slate-700 dark:text-slate-300" />
            </div>
            <div className="text-2xs text-slate-400">生成 [下界, 上界] 闭区间内的随机整数</div>
          </>
        )}

        {subTab === 'bytes' && (
          <div className="flex items-center gap-2">
            <span className="text-2xs text-slate-400 w-14 shrink-0">字节数</span>
            <input type="number" min={1} max={1024} value={byteCount} onChange={(e) => setByteCount(Number(e.target.value))}
              className="text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 w-24 text-slate-700 dark:text-slate-300" />
          </div>
        )}

        <button
          onClick={generate}
          className="w-full text-xs py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white font-medium transition-colors"
        >
          生成
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-3 mb-2 text-2xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md px-3 py-1.5 shrink-0">
          {error}
        </div>
      )}

      {/* Result */}
      <div className="flex-1 mx-3 mb-3 flex flex-col min-h-0">
        {output && (
          <>
            <textarea
              readOnly
              value={output}
              className="flex-1 min-h-[60px] text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-700 dark:text-slate-300 font-mono resize-none outline-none"
            />
            <button
              onClick={() => copy(output)}
              className="self-end mt-1.5 text-2xs px-3 py-1 bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-500/20 rounded-md transition-colors"
            >
              复制
            </button>
          </>
        )}
        {!output && !error && (
          <div className="flex-1 flex items-center justify-center text-2xs text-slate-400">
            配置参数后点击「生成」
          </div>
        )}
      </div>
    </div>
  );
};

export default GeneratorPanel;
