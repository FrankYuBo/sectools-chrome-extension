import React, { useState, useCallback, useEffect } from 'react';
import {
  analyzeUrl,
  analyzeHomoglyph,
} from '../../utils';
import type {
  UrlAnalysisResult,
  HomoglyphAnalysisResult,
  SecurityWarning,
  UrlParam,
} from '../../utils';

interface Props {
  onAutoCopy: (text: string) => void;
}

type SubTab = 'analyze' | 'unshorten' | 'homoglyph';

const SUB_TABS: { id: SubTab; label: string; icon: string }[] = [
  { id: 'analyze', label: '参数拆解', icon: '🔍' },
  { id: 'unshorten', label: '短链展开', icon: '🔗' },
  { id: 'homoglyph', label: '同形域名', icon: '⚠️' },
];

interface UnshortenHop {
  url: string;
  status: number;
  method: 'HEAD' | 'GET';
  location?: string;
}

interface UnshortenResult {
  finalUrl: string;
  hops: UnshortenHop[];
  totalHops: number;
  truncated: boolean;
}

const UrlPanel: React.FC<Props> = ({ onAutoCopy }) => {
  const [subTab, setSubTab] = useState<SubTab>('analyze');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [urlResult, setUrlResult] = useState<UrlAnalysisResult | null>(null);
  const [unshortenResult, setUnshortenResult] = useState<UnshortenResult | null>(null);
  const [homoglyphResult, setHomoglyphResult] = useState<HomoglyphAnalysisResult | null>(null);

  const runAnalyze = useCallback(() => {
    if (!input.trim()) {
      setUrlResult(null);
      setError('');
      return;
    }
    const result = analyzeUrl(input);
    if (result.success) {
      setUrlResult(result.data);
      setError('');
    } else {
      setUrlResult(null);
      setError(result.error ?? 'URL 解析失败');
    }
  }, [input]);

  const runUnshorten = useCallback(async () => {
    if (!input.trim()) {
      setUnshortenResult(null);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await new Promise<{ ok: boolean; data?: UnshortenResult; error?: string }>(
        (resolve) => {
          chrome.runtime.sendMessage(
            { type: 'sec:unshorten-url', url: input.trim(), maxHops: 20 },
            (res) => resolve(res),
          );
        },
      );
      if (response.ok && response.data) {
        setUnshortenResult(response.data);
      } else {
        setError(response.error ?? '短链展开失败');
        setUnshortenResult(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUnshortenResult(null);
    } finally {
      setLoading(false);
    }
  }, [input]);

  const runHomoglyph = useCallback(() => {
    if (!input.trim()) {
      setHomoglyphResult(null);
      setError('');
      return;
    }
    const result = analyzeHomoglyph(input.trim());
    if (result.success) {
      setHomoglyphResult(result.data);
      setError('');
    } else {
      setHomoglyphResult(null);
      setError(result.error ?? '同形字检测失败');
    }
  }, [input]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setError('');
      if (subTab === 'analyze') {
        runAnalyze();
      } else if (subTab === 'unshorten') {
        setUnshortenResult(null);
      } else if (subTab === 'homoglyph') {
        runHomoglyph();
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [input, subTab, runAnalyze, runHomoglyph]);

  const copyText = (text: string) => {
    if (text) {
      navigator.clipboard.writeText(text);
      onAutoCopy(text);
    }
  };

  const renderWarningBadge = (level: SecurityWarning['level']) => {
    const styles: Record<SecurityWarning['level'], string> = {
      critical: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
      warning: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
      info: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    };
    const labels: Record<SecurityWarning['level'], string> = {
      critical: '严重',
      warning: '警告',
      info: '提示',
    };
    return (
      <span className={`text-2xs px-1.5 py-0.5 rounded ${styles[level]}`}>
        {labels[level]}
      </span>
    );
  };

  const renderSeverityBadge = (severity: HomoglyphAnalysisResult['severity']) => {
    const styles: Record<HomoglyphAnalysisResult['severity'], string> = {
      critical: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
      warning: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
      info: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    };
    const labels: Record<HomoglyphAnalysisResult['severity'], string> = {
      critical: '高风险',
      warning: '中风险',
      info: '低风险',
    };
    return (
      <span className={`text-2xs px-2 py-0.5 rounded font-medium ${styles[severity]}`}>
        {labels[severity]}
      </span>
    );
  };

  const renderParamRow = (param: UrlParam, idx: number) => (
    <div key={idx} className="border-b border-slate-100 dark:border-slate-700/50 last:border-0 py-2">
      <div className="flex items-start gap-2">
        <div className="text-xs font-mono font-medium text-slate-700 dark:text-slate-300 min-w-[80px] break-all">
          {param.key}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-mono text-slate-600 dark:text-slate-400 break-all">
            {param.value}
          </div>
          {param.decodedValue && param.decodedValue !== param.value && (
            <div className="mt-1 text-2xs font-mono text-emerald-600 dark:text-emerald-400 break-all">
              → {param.decodedValue}
            </div>
          )}
          {param.hints.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {param.hints.map((h, hi) => (
                <span
                  key={hi}
                  className="text-2xs px-1.5 py-0.5 rounded bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400"
                  title={h.description + (h.preview ? `\n预览: ${h.preview}` : '')}
                >
                  {h.type}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderAnalyzeContent = () => {
    if (!urlResult) return null;
    const { parsed, securityWarnings, overallHints } = urlResult;

    return (
      <div className="flex flex-col gap-3 overflow-auto h-full pr-1">
        {securityWarnings.length > 0 && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
            <div className="text-2xs font-medium text-slate-500 dark:text-slate-400 mb-2">安全警告</div>
            <div className="space-y-1.5">
              {securityWarnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  {renderWarningBadge(w.level)}
                  <div className="flex-1 text-slate-700 dark:text-slate-300">
                    {w.message}
                    {w.location && (
                      <span className="text-slate-400 ml-1">[{w.location}]</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
          <div className="text-2xs font-medium text-slate-500 dark:text-slate-400 mb-2">URL 结构</div>
          <div className="space-y-1.5 text-xs">
            <div className="flex">
              <span className="text-slate-400 w-20 shrink-0">协议</span>
              <span className="font-mono text-slate-700 dark:text-slate-300 break-all">{parsed.protocol}</span>
            </div>
            <div className="flex">
              <span className="text-slate-400 w-20 shrink-0">域名</span>
              <span className="font-mono text-slate-700 dark:text-slate-300 break-all">
                {parsed.hostname}
                {parsed.port && <span className="text-primary-500">:{parsed.port}</span>}
              </span>
            </div>
            {parsed.username && (
              <div className="flex">
                <span className="text-slate-400 w-20 shrink-0">凭据</span>
                <span className="font-mono text-amber-600 dark:text-amber-400 break-all">
                  {parsed.username}{parsed.password ? `:***` : ''}
                </span>
              </div>
            )}
            <div className="flex">
              <span className="text-slate-400 w-20 shrink-0">路径</span>
              <span className="font-mono text-slate-700 dark:text-slate-300 break-all">
                {parsed.pathname || '/'}
              </span>
            </div>
            {parsed.pathSegments.length > 0 && (
              <div className="flex ml-20">
                <div className="flex flex-wrap gap-1">
                  {parsed.pathSegments.map((s, i) => (
                    <span key={i} className="text-2xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 font-mono">
                      /{s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {parsed.hashPath && (
              <div className="flex">
                <span className="text-slate-400 w-20 shrink-0">Hash 路径</span>
                <span className="font-mono text-purple-600 dark:text-purple-400 break-all">{parsed.hashPath}</span>
              </div>
            )}
          </div>
        </div>

        {parsed.queryParams.length > 0 && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-2xs font-medium text-slate-500 dark:text-slate-400">
                查询参数 ({parsed.queryParams.length})
              </div>
            </div>
            <div className="px-1">{parsed.queryParams.map(renderParamRow)}</div>
          </div>
        )}

        {parsed.hashParams.length > 0 && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-2xs font-medium text-slate-500 dark:text-slate-400">
                Hash 参数 ({parsed.hashParams.length})
              </div>
            </div>
            <div className="px-1">{parsed.hashParams.map(renderParamRow)}</div>
          </div>
        )}

        {overallHints.length > 0 && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
            <div className="text-2xs font-medium text-slate-500 dark:text-slate-400 mb-2">整体编码提示</div>
            <div className="space-y-1.5">
              {overallHints.map((h, i) => (
                <div key={i} className="text-xs flex items-start gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 text-2xs shrink-0">
                    {h.type}
                  </span>
                  <div className="text-slate-600 dark:text-slate-400">
                    {h.description}
                    {h.preview && (
                      <div className="mt-0.5 text-2xs font-mono text-slate-500 dark:text-slate-500 truncate">
                        预览: {h.preview}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderUnshortenContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            正在追踪跳转链...
          </div>
        </div>
      );
    }
    if (!unshortenResult) return null;

    return (
      <div className="flex flex-col gap-3 overflow-auto h-full pr-1">
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="text-2xs font-medium text-emerald-600 dark:text-emerald-400">最终地址</div>
            <button
              onClick={() => copyText(unshortenResult.finalUrl)}
              className="text-2xs px-2 py-0.5 bg-emerald-100 dark:bg-emerald-800/50 text-emerald-700 dark:text-emerald-300 rounded hover:bg-emerald-200 dark:hover:bg-emerald-700/50 transition-colors"
            >
              复制
            </button>
          </div>
          <div className="text-xs font-mono text-emerald-800 dark:text-emerald-200 break-all">
            {unshortenResult.finalUrl}
          </div>
          {unshortenResult.truncated && (
            <div className="mt-1.5 text-2xs text-amber-600 dark:text-amber-400">
              ⚠️ 已达最大跳转数限制，可能未完全展开
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-2xs font-medium text-slate-500 dark:text-slate-400">
              跳转链路 ({unshortenResult.totalHops} 跳)
            </div>
          </div>
          <div className="space-y-2">
            {unshortenResult.hops.map((hop, i) => (
              <div
                key={i}
                className="relative pl-6 pb-3 last:pb-0 border-l-2 border-slate-200 dark:border-slate-700 last:border-l-transparent"
              >
                <div className="absolute -left-[7px] top-0 w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-600 border-2 border-white dark:border-slate-800" />
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <span className="text-2xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 font-mono">
                    Hop {i + 1}
                  </span>
                  <span
                    className={`text-2xs px-1.5 py-0.5 rounded font-mono ${
                      hop.status >= 200 && hop.status < 300
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : hop.status >= 300 && hop.status < 400
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                    }`}
                  >
                    {hop.status}
                  </span>
                  <span className="text-2xs px-1 py-0.5 rounded bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400">
                    {hop.method}
                  </span>
                </div>
                <div className="text-xs font-mono text-slate-700 dark:text-slate-300 break-all mb-1">
                  {hop.url}
                </div>
                {hop.location && (
                  <div className="flex items-start gap-1">
                    <span className="text-2xs text-slate-400 shrink-0 mt-0.5">→</span>
                    <div className="text-2xs font-mono text-primary-600 dark:text-primary-400 break-all">
                      {hop.location}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderHomoglyphContent = () => {
    if (!homoglyphResult) return null;
    const { severity, hasIssue, summary, scriptMix, invisibleChars, homoglyphs, allCharInfo, punycodeDecoded, isPunycode } = homoglyphResult;

    return (
      <div className="flex flex-col gap-3 overflow-auto h-full pr-1">
        <div className={`rounded-lg border p-3 ${
          hasIssue
            ? severity === 'critical'
              ? 'border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20'
              : severity === 'warning'
              ? 'border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20'
              : 'border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20'
            : 'border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20'
        }`}>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">检测结果</div>
            {renderSeverityBadge(severity)}
          </div>
          <div className="space-y-1">
            {summary.map((s, i) => (
              <div key={i} className="text-xs text-slate-600 dark:text-slate-400">
                • {s}
              </div>
            ))}
          </div>
        </div>

        {isPunycode && punycodeDecoded && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
            <div className="text-2xs font-medium text-slate-500 dark:text-slate-400 mb-2">Punycode 解码</div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-mono text-purple-600 dark:text-purple-400 break-all flex-1">
                {punycodeDecoded}
              </div>
              <button
                onClick={() => copyText(punycodeDecoded)}
                className="text-2xs px-2 py-0.5 bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded hover:bg-purple-100 dark:hover:bg-purple-500/20 transition-colors shrink-0"
              >
                复制
              </button>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
          <div className="text-2xs font-medium text-slate-500 dark:text-slate-400 mb-2">脚本分析</div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {Object.entries(scriptMix.scriptsUsed)
              .filter(([, c]) => c > 0)
              .map(([s, c]) => (
                <span
                  key={s}
                  className={`text-2xs px-2 py-0.5 rounded font-mono ${
                    scriptMix.suspiciousMix && ['Latin', 'Cyrillic', 'Greek'].includes(s)
                      ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {s} ×{c}
                </span>
              ))}
          </div>
          {scriptMix.mixed && (
            <div className={`text-2xs ${scriptMix.suspiciousMix ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
              {scriptMix.suspiciousMix ? '⚠️ 高风险脚本混用（拉丁/西里尔/希腊）' : '多脚本混用'}，主导脚本：{scriptMix.dominantScript}
            </div>
          )}
        </div>

        {invisibleChars.length > 0 && (
          <div className="rounded-lg border border-red-200 dark:border-red-700 bg-white dark:bg-slate-800 p-3">
            <div className="text-2xs font-medium text-red-600 dark:text-red-400 mb-2">
              不可见字符 ({invisibleChars.length})
            </div>
            <div className="space-y-1.5">
              {invisibleChars.map((c, i) => (
                <div key={i} className="text-xs flex items-start gap-2">
                  <span className="font-mono px-1.5 py-0.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded shrink-0">
                    {c.hex}
                  </span>
                  <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded text-2xs shrink-0">
                    位置 {c.index}
                  </span>
                  <div className="text-slate-700 dark:text-slate-300 flex-1">
                    <div className="font-medium text-2xs">{c.category}</div>
                    <div className="text-2xs text-slate-500 dark:text-slate-400">{c.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {homoglyphs.length > 0 && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-700 bg-white dark:bg-slate-800 p-3">
            <div className="text-2xs font-medium text-amber-600 dark:text-amber-400 mb-2">
              同形异义字 ({homoglyphs.length})
            </div>
            <div className="space-y-1.5">
              {homoglyphs.map((h, i) => (
                <div key={i} className="text-xs flex items-start gap-2">
                  <span className="font-mono px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded shrink-0">
                    {h.hex}
                  </span>
                  <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded text-2xs shrink-0">
                    [{h.index}] {h.char}
                  </span>
                  <div className="text-slate-700 dark:text-slate-300 flex-1">
                    <div>
                      形似 <span className="font-mono font-bold text-primary-600 dark:text-primary-400">「{h.lookalike}」</span>
                      <span className="text-slate-400 ml-1">({h.originalScript})</span>
                    </div>
                    <div className="text-2xs text-slate-500 dark:text-slate-400">{h.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
          <div className="text-2xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            字符详情 ({allCharInfo.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {allCharInfo.map((c, i) => (
              <div
                key={i}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-2xs border ${
                  homoglyphs.some((h) => h.index === i)
                    ? 'border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                    : invisibleChars.some((v) => v.index === i)
                    ? 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                    : 'border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300'
                }`}
                title={`${c.hex} | ${c.script}`}
              >
                <span>{c.char === ' ' ? '␣' : c.char}</span>
                <span className="opacity-50">{c.hex.replace('U+', '')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderSubTabContent = () => {
    switch (subTab) {
      case 'analyze':
        return renderAnalyzeContent();
      case 'unshorten':
        return renderUnshortenContent();
      case 'homoglyph':
        return renderHomoglyphContent();
    }
  };

  const handleActionClick = () => {
    if (subTab === 'unshorten') {
      runUnshorten();
    }
  };

  const getActionLabel = () => {
    if (subTab === 'unshorten') {
      return loading ? '展开中...' : '展开短链';
    }
    return null;
  };

  const actionLabel = getActionLabel();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-0.5 px-3 py-2 border-b border-slate-200 dark:border-slate-700 shrink-0 overflow-x-auto">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setSubTab(t.id);
              setError('');
              setUrlResult(null);
              setUnshortenResult(null);
              setHomoglyphResult(null);
            }}
            className={`flex items-center gap-1 text-2xs px-2.5 py-1 rounded-md whitespace-nowrap transition-colors ${
              subTab === t.id
                ? 'bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 font-medium'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mx-3 mb-2 text-2xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md px-3 py-1.5 shrink-0">
          {error}
        </div>
      )}

      <div className="flex flex-col mx-3 my-2 shrink-0">
        <div className="flex items-center justify-between mb-0.5">
          <div className="text-2xs text-slate-400 dark:text-slate-500">
            {subTab === 'analyze' && '输入 URL 进行参数拆解'}
            {subTab === 'unshorten' && '输入短链接展开跳转链'}
            {subTab === 'homoglyph' && '输入域名/文本检测同形字'}
          </div>
          {actionLabel && (
            <button
              onClick={handleActionClick}
              disabled={loading || !input.trim()}
              className={`text-2xs px-3 py-1 rounded-md transition-colors ${
                loading || !input.trim()
                  ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                  : 'bg-primary-500 hover:bg-primary-600 text-white'
              }`}
            >
              {actionLabel}
            </button>
          )}
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            subTab === 'analyze'
              ? 'https://example.com/path?a=1&b=2#hash'
              : subTab === 'unshorten'
              ? 'https://bit.ly/xxxxxx'
              : 'example.com 或 suspicious-domain.com'
          }
          className="text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-slate-700 dark:text-slate-300 placeholder-slate-400 resize-none font-mono focus:ring-1 focus:ring-primary-500 outline-none h-[60px]"
        />
      </div>

      <div className="flex-1 mx-3 mb-3 min-h-0 overflow-hidden">
        {renderSubTabContent()}
      </div>
    </div>
  );
};

export default UrlPanel;
