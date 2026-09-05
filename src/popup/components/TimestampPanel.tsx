import React, { useState, useCallback, useEffect } from 'react';
import { usePersistentState } from '../../utils/persistent-state';
import {
  timestampToHuman, humanToTimestamp,
  getCurrentTimestamp, filetimeToHuman, humanToFiletime,
} from '../../utils';
import type { DateTimeInfo, TimestampUnit, AppSettings } from '../../types';

interface Props {
  settings: AppSettings;
  onAutoCopy: (text: string) => void;
}

type SubTab = 'unix' | 'filetime' | 'current';

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'unix', label: 'Unix时间戳' },
  { id: 'filetime', label: 'FILETIME' },
  { id: 'current', label: '当前时间' },
];

const TS_UNITS: { value: TimestampUnit; label: string }[] = [
  { value: 'auto', label: '自动' },
  { value: 's', label: '秒' },
  { value: 'ms', label: '毫秒' },
  { value: 'us', label: '微秒' },
  { value: 'ns', label: '纳秒' },
];

const TimestampPanel: React.FC<Props> = ({ settings, onAutoCopy }) => {
  const [subTab, setSubTab] = usePersistentState<SubTab>('ts.subTab', 'unix');
  const [direction, setDirection] = usePersistentState<'ts2human' | 'human2ts'>('ts.direction', 'ts2human');
  const [tsInput, setTsInput] = usePersistentState<string>('ts.input', '');
  const [humanInput, setHumanInput] = usePersistentState<string>('ts.humanInput', '');
  const [unit, setUnit] = usePersistentState<TimestampUnit>('ts.unit', settings.timestampDefaultUnit);
  const [targetUnit, setTargetUnit] = usePersistentState<TimestampUnit>('ts.targetUnit', 's');
  const [dateInfo, setDateInfo] = usePersistentState<DateTimeInfo | null>('ts.dateInfo', null);
  const [resultTs, setResultTs] = usePersistentState<number | bigint | null>('ts.resultTs', null);
  const [currentTimeInfo, setCurrentTimeInfo] = useState<ReturnType<typeof getCurrentTimestamp>['data'] | null>(null);
  const [error, setError] = useState('');

  // Auto-refresh current time every second
  useEffect(() => {
    if (subTab !== 'current') return;
    const update = () => {
      const r = getCurrentTimestamp(unit === 'auto' ? 's' : unit);
      if (r.success) setCurrentTimeInfo(r.data);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [subTab, unit]);

  const exec = useCallback(() => {
    setError('');
    setDateInfo(null);
    setResultTs(null);

    if (subTab === 'unix') {
      if (direction === 'ts2human') {
        if (!tsInput.trim()) return;
        const r = timestampToHuman(tsInput, unit === 'auto' ? undefined : unit);
        if (r.success) {
          setDateInfo(r.data);
        } else {
          setError(r.error ?? '');
        }
      } else {
        if (!humanInput.trim()) return;
        const r = humanToTimestamp(humanInput, targetUnit);
        if (r.success) {
          setResultTs(r.data);
        } else {
          setError(r.error ?? '');
        }
      }
    } else if (subTab === 'filetime') {
      if (direction === 'ts2human') {
        if (!tsInput.trim()) return;
        const r = filetimeToHuman(tsInput);
        if (r.success) {
          setDateInfo(r.data);
        } else {
          setError(r.error ?? '');
        }
      } else {
        if (!humanInput.trim()) return;
        const r = humanToFiletime(humanInput);
        if (r.success) {
          setResultTs(r.data);
        } else {
          setError(r.error ?? '');
        }
      }
    }
  }, [subTab, direction, tsInput, humanInput, unit, targetUnit, settings, onAutoCopy]);

  // 输入即运行
  useEffect(() => {
    const timer = setTimeout(exec, 150);
    return () => clearTimeout(timer);
  }, [exec]);

  return (
    <div className="flex flex-col h-full">
      {/* Sub tabs */}
      <div className="flex items-center gap-0.5 px-3 py-2 border-b border-slate-200 dark:border-slate-700 shrink-0">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => { setSubTab(t.id); setDateInfo(null); setResultTs(null); setError(''); }}
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
      {subTab !== 'current' && (
        <div className="flex items-center justify-between px-3 py-1.5 gap-2 shrink-0">
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-md p-0.5">
            <button
              onClick={() => setDirection('ts2human')}
              className={`text-2xs px-2.5 py-1 rounded transition-colors ${
                direction === 'ts2human' ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 font-medium shadow-sm' : 'text-slate-500'
              }`}
            >
              时间戳 → 可读
            </button>
            <button
              onClick={() => setDirection('human2ts')}
              className={`text-2xs px-2.5 py-1 rounded transition-colors ${
                direction === 'human2ts' ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 font-medium shadow-sm' : 'text-slate-500'
              }`}
            >
              可读 → 时间戳
            </button>
          </div>

          {direction === 'ts2human' && (
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as TimestampUnit)}
              className="text-2xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-slate-700 dark:text-slate-300"
            >
              {TS_UNITS.map((u) => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          )}

          {direction === 'human2ts' && (
            <select
              value={targetUnit}
              onChange={(e) => setTargetUnit(e.target.value as TimestampUnit)}
              className="text-2xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-slate-700 dark:text-slate-300"
            >
              {TS_UNITS.filter((u) => u.value !== 'auto').map((u) => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          )}

        </div>
      )}

      {/* Input area */}
      {subTab !== 'current' ? (
        <div className="px-3 mb-2 shrink-0">
          {direction === 'ts2human' ? (
            <textarea
              value={tsInput}
              onChange={(e) => setTsInput(e.target.value)}
              placeholder="输入时间戳..."
              rows={2}
              className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-slate-700 dark:text-slate-300 placeholder-slate-400 resize-none font-mono focus:ring-1 focus:ring-primary-500 outline-none"
            />
          ) : (
            <input
              type="text"
              value={humanInput}
              onChange={(e) => setHumanInput(e.target.value)}
              placeholder="如 2024-01-15 14:30:00"
              className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-slate-700 dark:text-slate-300 placeholder-slate-400 font-mono focus:ring-1 focus:ring-primary-500 outline-none"
            />
          )}
        </div>
      ) : (
        <div className="flex items-center justify-end px-3 py-1.5 shrink-0">
          <select
            value={unit === 'auto' ? 's' : unit}
            onChange={(e) => setUnit(e.target.value as TimestampUnit)}
            className="text-2xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-slate-700 dark:text-slate-300"
          >
            {TS_UNITS.filter((u) => u.value !== 'auto').map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-3 mb-2 text-2xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md px-3 py-1.5 shrink-0">
          {error}
        </div>
      )}

      {/* Result area */}
      <div className="flex-1 mx-3 mb-3 overflow-auto">
        {/* Date info card */}
        {dateInfo && (
          <div>
            <div className="space-y-1.5 text-xs">
              <InfoRow label="时间戳" value={dateInfo.timestamp} />
              <InfoRow label="检测单位" value={dateInfo.detectedUnit} />
              <InfoRow label="ISO 8601" value={dateInfo.iso8601} />
              <InfoRow label="本地时间" value={dateInfo.local} />
              <InfoRow label="时间格式" value={dateInfo.datetime} />
              <InfoRow label="UTC" value={dateInfo.utc} />
              <InfoRow label="Unix 秒" value={String(dateInfo.unixSeconds)} />
              <InfoRow label="Unix 毫秒" value={String(dateInfo.unixMillis)} />
            </div>
            <button
              onClick={() => { navigator.clipboard.writeText(dateInfo.datetime); onAutoCopy(dateInfo.datetime); }}
              className="mt-1.5 text-2xs px-3 py-1 bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-500/20 rounded-md transition-colors"
            >
              复制 (YYYY-MM-DD HH:mm:ss)
            </button>
          </div>
        )}

        {/* Result timestamp */}
        {resultTs !== null && (
          <div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">时间戳 ({targetUnit}):</div>
              <div className="text-sm font-mono text-primary-600 dark:text-primary-400 break-all">
                {String(resultTs)}
              </div>
            </div>
            <button
              onClick={() => { navigator.clipboard.writeText(String(resultTs)); onAutoCopy(String(resultTs)); }}
              className="mt-1.5 text-2xs px-3 py-1 bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-500/20 rounded-md transition-colors"
            >
              复制
            </button>
          </div>
        )}

        {/* Current time */}
        {subTab === 'current' && currentTimeInfo && (
          <div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
              <div className="text-xs text-slate-600 dark:text-slate-300 mb-2">{currentTimeInfo.human}</div>
              <div className="text-xl font-mono font-bold text-primary-500">
                {String(currentTimeInfo.timestamp)}
              </div>
              <div className="mt-1 text-2xs text-slate-400">
                单位: {unit === 'auto' ? 's' : unit}
              </div>
            </div>
            <button
              onClick={() => { navigator.clipboard.writeText(String(currentTimeInfo.timestamp)); onAutoCopy(String(currentTimeInfo.timestamp)); }}
              className="mt-1.5 text-2xs px-3 py-1 bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-500/20 rounded-md transition-colors"
            >
              复制
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-start gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 rounded">
    <span className="text-2xs text-slate-400 dark:text-slate-500 w-16 shrink-0 pt-0.5">{label}</span>
    <span className="text-xs text-slate-700 dark:text-slate-300 font-mono break-all">{value}</span>
  </div>
);

export default TimestampPanel;
