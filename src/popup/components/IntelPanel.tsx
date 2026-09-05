import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { usePersistentState } from '../../utils/persistent-state';
import type { AppSettings, IocMatch, IntelSourceType } from '../../types';
import { INTEL_SOURCES, buildIntelLink } from '../../utils/intel-sources';
import { detectIocs } from '../../utils/ioc-detector';

interface Props {
  settings: AppSettings;
  onAutoCopy: (text: string) => void;
}

const DISPLAYED_SOURCES = INTEL_SOURCES.slice(0, 10);

const IOC_TYPE_LABELS: Record<string, string> = {
  ipv4: 'IPv4',
  ipv6: 'IPv6',
  domain: '域名',
  url: 'URL',
  email: '邮箱',
  md5: 'MD5',
  sha1: 'SHA-1',
  sha256: 'SHA-256',
  sha512: 'SHA-512',
  cve: 'CVE',
  as: 'AS号',
  bitcoin: '比特币',
  ethereum: '以太坊',
  mac: 'MAC地址',
};

const IOC_TYPE_COLORS: Record<string, string> = {
  ipv4: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  ipv6: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300',
  domain: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  url: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300',
  email: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  md5: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  sha1: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  sha256: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  sha512: 'bg-lime-100 dark:bg-lime-900/30 text-lime-700 dark:text-lime-300',
  cve: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  as: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
  bitcoin: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  ethereum: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
  mac: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300',
};

const IntelPanel: React.FC<Props> = ({ settings, onAutoCopy }) => {
  const [inputText, setInputText] = usePersistentState<string>('intel.inputText', '');
  const [selectedSources, setSelectedSources] = useState<Set<IntelSourceType>>(
    new Set(settings.defaultIntelSources.filter((s) =>
      DISPLAYED_SOURCES.some((ds) => ds.id === s),
    )),
  );
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      for (const s of settings.defaultIntelSources) {
        if (DISPLAYED_SOURCES.some((ds) => ds.id === s)) {
          next.add(s);
        }
      }
      return next;
    });
  }, [settings.defaultIntelSources]);

  const detectedIocs = useMemo(() => {
    if (!inputText.trim()) return [];
    const result = detectIocs(inputText, { dedup: true, resolveOverlap: true });
    if (!result.success) return [];
    return result.data.matches;
  }, [inputText]);

  const groupedIocs = useMemo(() => {
    const groups: Record<string, IocMatch[]> = {};
    for (const m of detectedIocs) {
      if (!groups[m.type]) groups[m.type] = [];
      groups[m.type].push(m);
    }
    return groups;
  }, [detectedIocs]);

  const toggleSource = useCallback((id: IntelSourceType) => {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAllSources = useCallback(() => {
    setSelectedSources(new Set(DISPLAYED_SOURCES.map((s) => s.id)));
  }, []);

  const clearSources = useCallback(() => {
    setSelectedSources(new Set());
  }, []);

  const openInSource = useCallback((sourceId: IntelSourceType, ioc: IocMatch) => {
    const url = buildIntelLink(sourceId, { type: ioc.type, value: ioc.value });
    if (url) {
      chrome.tabs.create({ url, active: false });
    }
  }, []);

  const openAllParallel = useCallback(async () => {
    if (detectedIocs.length === 0 || selectedSources.size === 0) return;
    setOpening(true);
    try {
      const urls: string[] = [];
      for (const ioc of detectedIocs) {
        for (const sourceId of selectedSources) {
          const url = buildIntelLink(sourceId, { type: ioc.type, value: ioc.value });
          if (url) urls.push(url);
        }
      }
      for (let i = 0; i < urls.length; i++) {
        chrome.tabs.create({ url: urls[i], active: false });
        if (i < urls.length - 1) {
          await new Promise((r) => setTimeout(r, 80));
        }
      }
    } finally {
      setOpening(false);
    }
  }, [detectedIocs, selectedSources]);

  const copyIocValue = useCallback((value: string) => {
    navigator.clipboard.writeText(value);
    onAutoCopy(value);
  }, [onAutoCopy]);

  const totalLinks = useMemo(() => {
    let count = 0;
    for (const ioc of detectedIocs) {
      for (const sourceId of selectedSources) {
        const src = INTEL_SOURCES.find((s) => s.id === sourceId);
        if (src && src.supportedTypes.includes(ioc.type)) {
          count++;
        }
      }
    }
    return count;
  }, [detectedIocs, selectedSources]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header bar */}
      <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-700 dark:text-slate-200">威胁情报查询</span>
          {detectedIocs.length > 0 && (
            <span className="text-2xs text-slate-400 dark:text-slate-500">
              识别 {detectedIocs.length} 个 IOC · 共 {totalLinks} 条查询
            </span>
          )}
        </div>
        <button
          onClick={openAllParallel}
          disabled={detectedIocs.length === 0 || selectedSources.size === 0 || opening}
          className={`text-2xs px-2.5 py-1 rounded-md font-medium transition-all ${
            detectedIocs.length > 0 && selectedSources.size > 0 && !opening
              ? 'bg-primary-500 text-white hover:bg-primary-600 shadow-sm active:scale-95'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
          }`}
        >
          {opening ? '打开中...' : `⚡ 并行打开 (${totalLinks})`}
        </button>
      </div>

      {/* Input textarea */}
      <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 shrink-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-2xs text-slate-500 dark:text-slate-400">输入文本（自动识别 IOC）</span>
          {inputText && (
            <button
              onClick={() => setInputText('')}
              className="text-2xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              清空
            </button>
          )}
        </div>
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="粘贴日志、报告或任意文本... 支持 IP、域名、URL、邮箱、哈希、CVE 等"
          spellCheck={false}
          className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-slate-700 dark:text-slate-300 placeholder-slate-400 resize-none font-mono focus:ring-1 focus:ring-primary-500 outline-none"
          rows={4}
        />
      </div>

      {/* Source selector */}
      <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-2xs text-slate-500 dark:text-slate-400">情报源 ({selectedSources.size}/10)</span>
          <div className="flex items-center gap-2">
            <button
              onClick={selectAllSources}
              className="text-2xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
            >
              全选
            </button>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <button
              onClick={clearSources}
              className="text-2xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            >
              清空
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {DISPLAYED_SOURCES.map((src) => (
            <label
              key={src.id}
              className={`flex items-center gap-1.5 text-2xs px-2 py-1.5 rounded-md border cursor-pointer transition-all ${
                selectedSources.has(src.id)
                  ? 'border-primary-300 dark:border-primary-600 bg-primary-50 dark:bg-primary-500/10'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedSources.has(src.id)}
                onChange={() => toggleSource(src.id)}
                className="w-3 h-3 rounded text-primary-500 border-slate-300 dark:border-slate-600 focus:ring-primary-500 focus:ring-1"
              />
              <span className="shrink-0">{src.icon}</span>
              <span
                className={`truncate ${
                  selectedSources.has(src.id)
                    ? 'text-primary-700 dark:text-primary-300 font-medium'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
                title={src.name}
              >
                {src.name}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Detected IOCs list */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="px-3 py-1.5 shrink-0 flex items-center justify-between">
          <span className="text-2xs text-slate-500 dark:text-slate-400">
            识别结果 {detectedIocs.length > 0 && `(${detectedIocs.length})`}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {!inputText && (
            <div className="text-center py-8 text-2xs text-slate-400 dark:text-slate-500">
              在上方输入框粘贴文本以识别 IOC
            </div>
          )}
          {inputText && detectedIocs.length === 0 && (
            <div className="text-center py-8 text-2xs text-slate-400 dark:text-slate-500">
              未识别到 IOC 指标
            </div>
          )}
          <div className="space-y-3">
            {Object.entries(groupedIocs).map(([type, matches]) => (
              <div key={type}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span
                    className={`text-2xs px-1.5 py-0.5 rounded font-medium ${
                      IOC_TYPE_COLORS[type] ?? 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {IOC_TYPE_LABELS[type] ?? type}
                  </span>
                  <span className="text-2xs text-slate-400 dark:text-slate-500">× {matches.length}</span>
                </div>
                <div className="space-y-1">
                  {matches.map((m, idx) => (
                    <div
                      key={`${m.type}-${m.value}-${idx}`}
                      className="group rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 overflow-hidden"
                    >
                      <div
                        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                        onClick={() => copyIocValue(m.value)}
                        title="点击复制值"
                      >
                        <code className="flex-1 text-xs font-mono text-slate-800 dark:text-slate-200 break-all truncate">
                          {m.value.length > 60 ? m.value.slice(0, 60) + '…' : m.value}
                        </code>
                        <span className="text-2xs text-slate-400 dark:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          📋
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 px-2 pb-1.5">
                        {DISPLAYED_SOURCES.filter((s) => selectedSources.has(s.id) && s.supportedTypes.includes(m.type)).map(
                          (src) => {
                            const url = buildIntelLink(src.id, { type: m.type, value: m.value });
                            if (!url) return null;
                            return (
                              <button
                                key={src.id}
                                onClick={() => openInSource(src.id, m)}
                                className="text-2xs px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-600 hover:bg-primary-50 dark:hover:bg-primary-500/10 hover:text-primary-700 dark:hover:text-primary-300 transition-all shrink-0 flex items-center gap-1"
                                title={`在 ${src.name} 中查询`}
                              >
                                <span>{src.icon}</span>
                                <span className="max-w-[60px] truncate">{src.nameEn}</span>
                              </button>
                            );
                          },
                        )}
                        {DISPLAYED_SOURCES.filter((s) => selectedSources.has(s.id) && s.supportedTypes.includes(m.type))
                          .length === 0 && (
                          <span className="text-2xs text-slate-400 dark:text-slate-500 px-1.5 py-0.5">
                            无可用情报源
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default IntelPanel;
