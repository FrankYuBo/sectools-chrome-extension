import React, { useState, useEffect, useCallback } from 'react';
import type { AppSettings, ThemeMode, HashAlgorithm, TimestampUnit, IntelSourceType, AiConfig, TabId, BuiltInDesensitizeRuleId, McpServerConfig, McpToolDefinition } from '../types';
import { INTEL_SOURCES } from '../utils/intel-sources';
import { validateSelectionRules } from '../utils/selection-filter';
import { saveSettings, initSettings, isLegacyDefaultPromptTemplate, buildSettingsExport, validateSettingsImport, applySettingsImport } from '../utils/settings';
import { CORE_TAB_IDS, DEFAULT_AI_CONFIG } from '../types';
import { getBuiltinRuleMeta } from '../utils/desensitize';

// --- 常量 ---

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '亮色' },
  { value: 'dark', label: '暗色' },
];

const HASH_OPTIONS: { value: HashAlgorithm; label: string }[] = [
  { value: 'MD5', label: 'MD5' },
  { value: 'SHA-1', label: 'SHA-1' },
  { value: 'SHA-256', label: 'SHA-256' },
  { value: 'SHA-384', label: 'SHA-384' },
  { value: 'SHA-512', label: 'SHA-512' },
];

const TS_UNIT_OPTIONS: { value: TimestampUnit; label: string }[] = [
  { value: 's', label: '秒 (s)' },
  { value: 'ms', label: '毫秒 (ms)' },
  { value: 'us', label: '微秒 (us)' },
  { value: 'ns', label: '纳秒 (ns)' },
];

const TAB_LABELS: Record<TabId, string> = {
  intel: '威胁情报',
  url: 'URL分析',
  encode: '编解码',
  crypto: '加密哈希',
  regex: '正则',
  network: '网络',
  format: '格式化',
  timestamp: '时间转换',
  number: '进制转换',
  generator: '生成器',
};

const splitRuleLines = (text: string): string[] =>
  text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

// --- Toggle 开关（Chrome 扩展管理页风格：圆点在右=开，在左=关，突出轨道） ---
const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }> = ({
  checked, onChange, disabled,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => !disabled && onChange(!checked)}
    className={`relative w-9 h-3.5 rounded-full transition-colors shrink-0 my-2 focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:outline-none ${
      disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
    } ${checked ? 'bg-primary-500' : 'bg-slate-300 dark:bg-slate-600'}`}
  >
    <span
      className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-200 ${
        checked ? 'left-[calc(100%-18px)]' : 'left-[-2px]'
      }`}
    />
  </button>
);

// --- Section 容器 ---
const Section: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({
  title, description, children,
}) => (
  <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
    <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-1">{title}</h3>
    {description && <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{description}</p>}
    <div className="space-y-4">{children}</div>
  </section>
);

// --- Toast ---
function useToast() {
  const [msg, setMsg] = useState('');
  const show = useCallback((text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 2500);
  }, []);
  const Toast = msg ? (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-800 text-sm px-4 py-2 rounded-lg shadow-lg z-50">
      {msg}
    </div>
  ) : null;
  return { show, Toast };
}

// ============================================================
// Main App
// ============================================================
export default function SettingsApp() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const { show, Toast } = useToast();

  // 名单编辑态
  const [whitelistText, setWhitelistText] = useState('');
  const [blacklistText, setBlacklistText] = useState('');

  // AI
  const [modelList, setModelList] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // MCP
  const [mcpToolsMap, setMcpToolsMap] = useState<Record<string, McpToolDefinition[]>>({});
  const [mcpTesting, setMcpTesting] = useState<Record<string, boolean>>({});

  // 配置迁移
  const [exportIncludeSecrets, setExportIncludeSecrets] = useState(true);

  useEffect(() => {
    initSettings().then((s) => {
      setSettings(s);
      setWhitelistText(s.selectionToolbarRules.join('\n'));
      setBlacklistText(s.selectionToolbarBlockRules.join('\n'));
      setModelList(s.aiConfig.modelList ?? []);
    });
  }, []);

  const update = useCallback(
    (partial: Partial<AppSettings>) => {
      setSettings((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...partial };
        saveSettings(partial);
        return next;
      });
    },
    [],
  );

  const updateAi = useCallback(
    (partial: Partial<AiConfig>) => {
      setSettings((prev) => {
        if (!prev) return prev;
        const next = { ...prev, aiConfig: { ...prev.aiConfig, ...partial } };
        saveSettings({ aiConfig: next.aiConfig });
        return next;
      });
    },
    [],
  );

  if (!settings) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400">加载中...</div>
      </div>
    );
  }

  const whitelistVal = validateSelectionRules(splitRuleLines(whitelistText));
  const blacklistVal = validateSelectionRules(splitRuleLines(blacklistText));
  const blacklistIneffective =
    whitelistVal.rules.length > 0 &&
    (blacklistVal.rules.length > 0 || blacklistVal.issues.length > 0);

  const ai = settings.aiConfig;

  // --- AI: 获取模型列表 ---
  const fetchModels = async () => {
    if (!ai.baseUrl || !ai.apiKey) {
      show('请先填写 Base URL 和 API Key');
      return;
    }
    setFetchingModels(true);
    try {
      const base = ai.baseUrl.replace(/\/+$/, '');
      const resp = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${ai.apiKey}` },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const ids: string[] = (data.data || [])
        .map((m: { id: string }) => m.id)
        .sort();
      setModelList(ids);
      // 持久化模型列表到设置，供聊天对话框使用
      updateAi({ modelList: ids });
      if (ids.length === 0) show('模型列表为空');
      else show(`获取到 ${ids.length} 个模型`);
    } catch (e) {
      show(`获取失败: ${(e as Error).message}`);
      setModelList([]);
    } finally {
      setFetchingModels(false);
    }
  };

  // --- AI: 测试连接 ---
  const testConnection = async () => {
    if (!ai.baseUrl || !ai.apiKey || !ai.model) {
      show('请先填写 Base URL、API Key 和模型名称');
      return;
    }
    setTestingConnection(true);
    try {
      const base = ai.baseUrl.replace(/\/+$/, '');
      const resp = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ai.apiKey}`,
        },
        body: JSON.stringify({
          model: ai.model,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 5,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      show('连接成功');
    } catch (e) {
      show(`连接失败: ${(e as Error).message}`);
    } finally {
      setTestingConnection(false);
    }
  };

  // --- Tab 排序操作 ---
  const moveTab = (order: TabId[], fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= order.length) return;
    const next = [...order];
    const [item] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, item);
    update({ tabOrder: next });
  };

  const toggleTabVisibility = (tabId: TabId) => {
    const isCore = (CORE_TAB_IDS as readonly string[]).includes(tabId);
    if (isCore) return;
    const hidden = new Set(settings.hiddenTabs);
    if (hidden.has(tabId)) {
      hidden.delete(tabId);
    } else {
      hidden.add(tabId);
    }
    update({ hiddenTabs: Array.from(hidden) as TabId[] });
  };

  const inputCls =
    'w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none';
  const labelCls = 'block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {Toast}

      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <span className="text-xl font-bold text-slate-800 dark:text-slate-100">SecTools</span>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <span className="text-lg text-slate-600 dark:text-slate-400">设置</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* ====== 配置迁移 ====== */}
        <Section title="配置迁移" description="导出当前全部配置为 JSON 文件，换电脑时导入即可恢复（含 AI / MCP / 情报富化 / 脱敏 / 工具栏等所有设置）。">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                const includeSecrets = exportIncludeSecrets;
                if (includeSecrets) {
                  if (!confirm('导出将包含 API Key / MCP Token 等敏感信息，请妥善保管该文件。继续？')) return;
                }
                const file = buildSettingsExport(settings, includeSecrets);
                const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                const d = new Date();
                a.href = url;
                a.download = `sectools-settings-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
                a.click();
                URL.revokeObjectURL(url);
                show(includeSecrets ? '已导出（含敏感信息，注意保管）' : '已导出（敏感信息已脱敏）');
              }}
              className="px-4 py-2 text-sm rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors"
            >
              导出配置
            </button>

            <label className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition-colors">
              导入配置
              <input
                type="file" accept=".json,application/json" className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = ''; // 允许重复选择同一文件
                  if (!file) return;
                  try {
                    const raw = await file.text();
                    const { error, file: parsed } = validateSettingsImport(raw);
                    if (error || !parsed) {
                      show(`导入失败: ${error}`);
                      return;
                    }
                    const verNote = parsed.schemaVersion < 7
                      ? `（文件为 schema v${parsed.schemaVersion}，导入后将自动升级迁移）`
                      : '';
                    if (!confirm(`确认导入配置？当前配置将被覆盖${verNote}`)) return;
                    await applySettingsImport(parsed);
                    show('导入成功，页面即将刷新');
                    setTimeout(() => location.reload(), 800);
                  } catch (err) {
                    show(`导入失败: ${(err as Error).message}`);
                  }
                }}
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 cursor-pointer select-none w-fit">
            <input
              type="checkbox"
              checked={exportIncludeSecrets}
              onChange={(e) => setExportIncludeSecrets(e.target.checked)}
              className="w-3.5 h-3.5 rounded text-primary-500 border-slate-300 dark:border-slate-600"
            />
            导出时包含 API Key / MCP Token 等敏感信息（迁移电脑建议勾选，文件请妥善保管）
          </label>
        </Section>

        {/* ====== 外观 ====== */}
        <Section title="外观">
          <div>
            <label className={labelCls}>主题模式</label>
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5 w-fit">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => update({ themeMode: opt.value })}
                  className={`text-sm px-4 py-1.5 rounded-md transition-colors ${
                    settings.themeMode === opt.value
                      ? 'bg-white dark:bg-slate-600 text-primary-600 dark:text-primary-400 font-medium shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* ====== 行为 ====== */}
        <Section title="行为">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-700 dark:text-slate-300">自动复制结果</div>
              <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">工具面板计算结果自动复制到剪贴板</div>
            </div>
            <Toggle checked={settings.autoCopyResult} onChange={(v) => update({ autoCopyResult: v })} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>最大解码层数</label>
              <input
                type="number" min={1} max={20}
                value={settings.maxDecodeDepth}
                onChange={(e) => update({ maxDecodeDepth: Math.max(1, Math.min(20, parseInt(e.target.value) || 10)) })}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>JSON 缩进</label>
              <input
                type="number" min={1} max={8}
                value={settings.indentSize}
                onChange={(e) => update({ indentSize: Math.max(1, Math.min(8, parseInt(e.target.value) || 2)) })}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>默认哈希算法</label>
              <select
                value={settings.defaultHashAlgorithm}
                onChange={(e) => update({ defaultHashAlgorithm: e.target.value as HashAlgorithm })}
                className={inputCls}
              >
                {HASH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>时间戳默认单位</label>
              <select
                value={settings.timestampDefaultUnit}
                onChange={(e) => update({ timestampDefaultUnit: e.target.value as TimestampUnit })}
                className={inputCls}
              >
                {TS_UNIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        </Section>

        {/* ====== 选中文本工具栏 ====== */}
        <Section title="选中文本浮动工具栏" description="默认全部页面弹框；白名单非空时仅命中页面弹框；白名单为空且黑名单非空时命中黑名单的页面不弹。此设置不影响右键菜单。">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-700 dark:text-slate-300">启用浮动工具栏</span>
            <Toggle checked={settings.selectionToolbarEnabled} onChange={(v) => update({ selectionToolbarEnabled: v })} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-slate-600 dark:text-slate-400">白名单（命中才弹）</label>
              <span className="text-xs text-slate-400">有效 {whitelistVal.rules.length} 条</span>
            </div>
            <textarea
              rows={4} spellCheck={false}
              value={whitelistText}
              placeholder={'*.corp.internal\n10.0.0.0/8\n/^dev-/i'}
              onChange={(e) => { setWhitelistText(e.target.value); update({ selectionToolbarRules: splitRuleLines(e.target.value) }); }}
              className={`${inputCls} font-mono text-xs resize-y`}
            />
            <p className="text-xs text-slate-400 mt-1">一行一条：纯域名 / *.通配符 / CIDR 或单 IP / 正则（仅 i 标志）</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-slate-600 dark:text-slate-400">黑名单（命中不弹，仅白名单为空时生效）</label>
              <span className="text-xs text-slate-400">有效 {blacklistVal.rules.length} 条</span>
            </div>
            <textarea
              rows={3} spellCheck={false}
              value={blacklistText}
              placeholder={'mail.google.com\n*.google.com'}
              onChange={(e) => { setBlacklistText(e.target.value); update({ selectionToolbarBlockRules: splitRuleLines(e.target.value) }); }}
              className={`${inputCls} font-mono text-xs resize-y`}
            />
          </div>

          {blacklistIneffective && (
            <div className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg px-3 py-2">
              当前白名单非空，黑名单不生效（白名单优先）。
            </div>
          )}
        </Section>

        {/* ====== 情报源默认勾选 ====== */}
        <Section title="情报源默认勾选">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-sm text-slate-500">已选 {settings.defaultIntelSources.length} / {INTEL_SOURCES.length}</span>
            <button onClick={() => update({ defaultIntelSources: INTEL_SOURCES.map((s) => s.id as IntelSourceType) })} className="text-sm text-primary-600 dark:text-primary-400 hover:underline">全选</button>
            <button onClick={() => update({ defaultIntelSources: [] })} className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:underline">清空</button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {INTEL_SOURCES.map((src) => {
              const checked = settings.defaultIntelSources.includes(src.id as IntelSourceType);
              return (
                <label key={src.id} className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                  checked
                    ? 'border-primary-300 dark:border-primary-600 bg-primary-50 dark:bg-primary-500/10'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                }`}>
                  <input type="checkbox" checked={checked} onChange={(e) => {
                    const cur = new Set(settings.defaultIntelSources);
                    if (e.target.checked) cur.add(src.id as IntelSourceType);
                    else cur.delete(src.id as IntelSourceType);
                    update({ defaultIntelSources: Array.from(cur) });
                  }} className="w-4 h-4 rounded text-primary-500 border-slate-300 dark:border-slate-600 focus:ring-primary-500" />
                  <span className="shrink-0">{src.icon}</span>
                  <span className={checked ? 'text-primary-700 dark:text-primary-300 font-medium' : 'text-slate-600 dark:text-slate-300'} title={src.name}>{src.name}</span>
                </label>
              );
            })}
          </div>
        </Section>

        {/* ====== Tab 排序与显示 ====== */}
        <Section title="面板排序与显示" description="控制 Popup 中 Tab 栏的面板显示顺序和可见性。核心面板不可隐藏。">
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-200 dark:divide-slate-700">
            {settings.tabOrder.map((tabId, idx) => {
              const isCore = (CORE_TAB_IDS as readonly string[]).includes(tabId);
              const isHidden = settings.hiddenTabs.includes(tabId);
              return (
                <div key={tabId} className={`flex items-center gap-3 px-4 py-2.5 ${isHidden ? 'opacity-50' : ''}`}>
                  {/* 序号 */}
                  <span className="text-xs text-slate-400 w-5 text-center font-mono">{idx + 1}</span>

                  {/* 名称 */}
                  <span className={`text-sm flex-1 ${isHidden ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'}`}>
                    {TAB_LABELS[tabId]}
                    {isCore && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500">核心</span>}
                  </span>

                  {/* 可见性开关 */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400">显示</span>
                    <Toggle checked={!isHidden} onChange={() => toggleTabVisibility(tabId)} disabled={isCore} />
                  </div>

                  {/* 上下移动按钮 */}
                  <div className="flex flex-col gap-0.5">
                    <button
                      disabled={idx === 0}
                      onClick={() => moveTab(settings.tabOrder, idx, idx - 1)}
                      className="w-6 h-5 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="上移"
                    >
                      <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                    </button>
                    <button
                      disabled={idx === settings.tabOrder.length - 1}
                      onClick={() => moveTab(settings.tabOrder, idx, idx + 1)}
                      className="w-6 h-5 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="下移"
                    >
                      <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ====== AI 研判 ====== */}
        <Section title="AI 研判" description="配置大模型服务，选中文本后可一键发送 AI 研判。兼容 OpenAI / Anthropic(国内代理) / DeepSeek / Qwen / Moonshot 等标准格式。">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className={labelCls}>API Base URL</label>
              <input
                type="text"
                value={ai.baseUrl}
                onChange={(e) => updateAi({ baseUrl: e.target.value })}
                placeholder="https://api.openai.com/v1"
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>API Key</label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={ai.apiKey}
                  onChange={(e) => updateAi({ apiKey: e.target.value })}
                  placeholder="sk-..."
                  className={inputCls + ' pr-10'}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xs"
                >
                  {showApiKey ? '隐藏' : '显示'}
                </button>
              </div>
            </div>

            <div>
              <label className={labelCls}>模型</label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={ai.model}
                    onChange={(e) => updateAi({ model: e.target.value })}
                    placeholder={modelList.length > 0 ? '输入或从建议列表选择' : '手动输入或点击右侧获取模型列表'}
                    className={inputCls}
                    list="ai-model-datalist"
                  />
                  {modelList.length > 0 && (
                    <datalist id="ai-model-datalist">
                      {modelList.map((id) => <option key={id} value={id} />)}
                    </datalist>
                  )}
                </div>
                <button
                  onClick={fetchModels}
                  disabled={fetchingModels || !ai.baseUrl || !ai.apiKey}
                  className="shrink-0 px-3 py-2 text-sm rounded-lg border border-primary-300 dark:border-primary-600 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                  {fetchingModels ? '获取中...' : '获取模型列表'}
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className={labelCls}>
                  Prompt 模板
                  <span className="font-normal text-xs text-slate-400 ml-1">使用 {'{{content}}'} 作为选中文本的占位符</span>
                </label>
                <button
                  onClick={() => {
                    if (confirm('确定要将 Prompt 模板恢复为默认的 SOC 分析专家模板吗？当前自定义内容将被覆盖。')) {
                      updateAi({ promptTemplate: DEFAULT_AI_CONFIG.promptTemplate });
                      show('已恢复默认模板');
                    }
                  }}
                  className="text-xs px-2 py-1 rounded-md border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0"
                >
                  恢复默认
                </button>
              </div>
              <textarea
                rows={5} spellCheck={false}
                value={ai.promptTemplate}
                onChange={(e) => updateAi({ promptTemplate: e.target.value })}
                className={inputCls + ' font-mono text-xs resize-y'}
              />
              {isLegacyDefaultPromptTemplate(ai.promptTemplate) && (
                <p className="text-xs text-amber-500 mt-1">
                  当前使用的是旧版默认模板，建议点击「恢复默认」升级为 SOC 分析专家模板。
                </p>
              )}
            </div>

            <div>
              <label className={labelCls}>
                DOM 父选择器
                <span className="font-normal text-xs text-slate-400 ml-1">可选，如 tr.ticket-row</span>
              </label>
              <input
                type="text"
                value={ai.domParentSelector}
                onChange={(e) => updateAi({ domParentSelector: e.target.value })}
                placeholder="tr.ticket-row / .ticket-item / div.alert-card"
                className={inputCls}
              />
              <p className="text-xs text-slate-400 mt-1">
                填入后，选中页面文本时自动向上查找匹配该选择器的祖先元素，提取其完整文本。不填则直接使用选中文本。
              </p>
            </div>

            {/* 聊天组件站点白名单 */}
            <div>
              <label className={labelCls}>
                聊天组件显示站点
                <span className="font-normal text-xs text-slate-400 ml-1">空白名单 = 全部显示；一行一条域名或 *.通配符</span>
              </label>
              <textarea
                rows={3} spellCheck={false}
                value={ai.chatWidgetSites.join('\n')}
                placeholder={'*.corp.internal\nticketing.internal.corp'}
                onChange={(e) => updateAi({ chatWidgetSites: splitRuleLines(e.target.value) })}
                className={inputCls + ' font-mono text-xs resize-y'}
              />
            </div>

            {/* 脱敏总开关 */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-700 dark:text-slate-300">启用脱敏</div>
                <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">发送前自动脱敏 IP/域名/邮箱/手机号/身份证/哈希等敏感信息</div>
              </div>
              <Toggle checked={ai.desensitizeEnabled} onChange={(v) => updateAi({ desensitizeEnabled: v })} />
            </div>

            {/* 内置脱敏规则 */}
            {ai.desensitizeEnabled && (
              <div>
                <label className={labelCls}>内置脱敏规则</label>
                <div className="grid grid-cols-2 gap-2">
                  {getBuiltinRuleMeta().map((rule) => {
                    const checked = ai.builtInDesensitizeRules[rule.id as BuiltInDesensitizeRuleId] ?? true;
                    return (
                      <label
                        key={rule.id}
                        className={`flex flex-col gap-0.5 text-sm px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                          checked
                            ? 'border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-500/10'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              updateAi({
                                builtInDesensitizeRules: {
                                  ...ai.builtInDesensitizeRules,
                                  [rule.id]: e.target.checked,
                                },
                              })
                            }
                            className="w-4 h-4 rounded text-amber-500 border-slate-300 dark:border-slate-600 focus:ring-amber-500"
                          />
                          <span className={checked ? 'text-amber-700 dark:text-amber-300 font-medium' : 'text-slate-600 dark:text-slate-300'}>
                            {rule.label}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400 dark:text-slate-500 pl-6 font-mono">
                          {rule.description}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 自定义脱敏规则 */}
            {ai.desensitizeEnabled && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={labelCls}>自定义脱敏正则</label>
                  <button
                    onClick={() =>
                      updateAi({
                        customDesensitizeRules: [
                          ...ai.customDesensitizeRules,
                          { id: `custom-${Date.now()}`, label: '新规则', pattern: '', replacement: '***', enabled: true },
                        ],
                      })
                    }
                    className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    + 添加规则
                  </button>
                </div>
                {ai.customDesensitizeRules.length === 0 && (
                  <p className="text-xs text-slate-400">暂无自定义规则</p>
                )}
                <div className="space-y-2">
                  {ai.customDesensitizeRules.map((rule, idx) => (
                    <div key={rule.id} className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(e) => {
                          const next = [...ai.customDesensitizeRules];
                          next[idx] = { ...next[idx], enabled: e.target.checked };
                          updateAi({ customDesensitizeRules: next });
                        }}
                        className="w-4 h-4 rounded text-amber-500 border-slate-300 dark:border-slate-600"
                      />
                      <input
                        type="text"
                        value={rule.label}
                        placeholder="名称"
                        onChange={(e) => {
                          const next = [...ai.customDesensitizeRules];
                          next[idx] = { ...next[idx], label: e.target.value };
                          updateAi({ customDesensitizeRules: next });
                        }}
                        className="w-20 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1"
                      />
                      <input
                        type="text"
                        value={rule.pattern}
                        placeholder="正则表达式"
                        onChange={(e) => {
                          const next = [...ai.customDesensitizeRules];
                          next[idx] = { ...next[idx], pattern: e.target.value };
                          updateAi({ customDesensitizeRules: next });
                        }}
                        className="flex-1 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1"
                      />
                      <input
                        type="text"
                        value={rule.replacement}
                        placeholder="替换为"
                        onChange={(e) => {
                          const next = [...ai.customDesensitizeRules];
                          next[idx] = { ...next[idx], replacement: e.target.value };
                          updateAi({ customDesensitizeRules: next });
                        }}
                        className="w-20 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1"
                      />
                      <button
                        onClick={() => {
                          const next = ai.customDesensitizeRules.filter((_, i) => i !== idx);
                          updateAi({ customDesensitizeRules: next });
                        }}
                        className="text-slate-400 hover:text-red-500 text-xs shrink-0"
                        title="删除"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={testConnection}
                disabled={testingConnection || !ai.baseUrl || !ai.apiKey || !ai.model}
                className="px-4 py-2 text-sm rounded-lg bg-primary-500 hover:bg-primary-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {testingConnection ? '测试中...' : '测试连接'}
              </button>
            </div>
          </div>
        </Section>

        {/* ====== MCP 服务器 ====== */}
        <Section title="MCP 服务器" description="配置外部 MCP Server，研判时自动调用工具查询资产/威胁情报等信息。MCP Server 需支持 Streamable HTTP 传输。若连接报 403 Invalid Origin，需在服务端放行扩展 Origin（错误信息中含可复制的 chrome-extension:// 地址）或关闭 DNS Rebinding 防护。">
          {ai.mcpServers.map((server, idx) => {
            const tools = mcpToolsMap[server.id] ?? [];
            const testing = mcpTesting[server.id] ?? false;
            return (
              <div key={server.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">服务器 {idx + 1}</span>
                  <div className="flex items-center gap-2">
                    <Toggle checked={server.enabled} onChange={(v) => {
                      const next = [...ai.mcpServers];
                      next[idx] = { ...next[idx], enabled: v };
                      updateAi({ mcpServers: next });
                    }} />
                    <button
                      onClick={() => {
                        const next = ai.mcpServers.filter((_, i) => i !== idx);
                        updateAi({ mcpServers: next });
                        const m = { ...mcpToolsMap };
                        delete m[server.id];
                        setMcpToolsMap(m);
                      }}
                      className="text-slate-400 hover:text-red-500 text-xs shrink-0" title="删除"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">名称</label>
                    <input
                      type="text" value={server.name}
                      onChange={(e) => {
                        const next = [...ai.mcpServers];
                        next[idx] = { ...next[idx], name: e.target.value };
                        updateAi({ mcpServers: next });
                      }}
                      placeholder="如：资产 CMDB" className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">URL</label>
                    <input
                      type="text" value={server.url}
                      onChange={(e) => {
                        const next = [...ai.mcpServers];
                        next[idx] = { ...next[idx], url: e.target.value };
                        updateAi({ mcpServers: next });
                      }}
                      placeholder="http://localhost:3001/mcp" className={inputCls}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Auth Token（可选）</label>
                  <input
                    type="password" value={server.authToken} autoComplete="off"
                    onChange={(e) => {
                      const next = [...ai.mcpServers];
                      next[idx] = { ...next[idx], authToken: e.target.value };
                      updateAi({ mcpServers: next });
                    }}
                    placeholder="Bearer token（留空则不发送）" className={inputCls}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={async () => {
                      if (!server.url) { show('请填写 URL'); return; }
                      setMcpTesting((p) => ({ ...p, [server.id]: true }));
                      try {
                        const resp = await chrome.runtime.sendMessage({ type: 'sec:mcp-test-connection', serverId: server.id });
                        if (resp.ok) {
                          setMcpToolsMap((p) => ({ ...p, [server.id]: resp.data.tools }));
                          show(`连接成功，发现 ${resp.data.toolCount} 个工具`);
                        } else {
                          show(`连接失败: ${resp.error}`);
                        }
                      } catch (e) {
                        show(`连接失败: ${(e as Error).message}`);
                      } finally {
                        setMcpTesting((p) => ({ ...p, [server.id]: false }));
                      }
                    }}
                    disabled={testing || !server.url}
                    className="px-3 py-1.5 text-xs rounded-lg border border-primary-300 dark:border-primary-600 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-500/10 disabled:opacity-50 transition-colors"
                  >
                    {testing ? '测试中...' : '测试连接' }
                  </button>
                  {tools.length > 0 && (
                    <span className="text-xs text-slate-400">{tools.length} 个工具可用</span>
                  )}
                </div>

                {/* 工具列表 + 自动调用勾选 */}
                {tools.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 block">
                      研判时自动调用（勾选后，发送 AI 研判前会自动调用这些工具丰富上下文）
                    </label>
                    <div className="space-y-1.5">
                      {tools.map((tool) => {
                        const autoCall = server.autoCallTools.includes(tool.name);
                        return (
                          <label key={tool.name} className={`flex items-start gap-2 text-xs px-2.5 py-2 rounded-lg border cursor-pointer transition-all ${
                            autoCall
                              ? 'border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-500/10'
                              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                          }`}>
                            <input
                              type="checkbox" checked={autoCall}
                              onChange={(e) => {
                                let next: string[];
                                if (e.target.checked) {
                                  next = [...server.autoCallTools, tool.name];
                                } else {
                                  next = server.autoCallTools.filter((t) => t !== tool.name);
                                }
                                const servers = [...ai.mcpServers];
                                servers[idx] = { ...servers[idx], autoCallTools: next };
                                updateAi({ mcpServers: servers });
                              }}
                              className="w-3.5 h-3.5 mt-0.5 rounded text-blue-500 border-slate-300 dark:border-slate-600"
                            />
                            <div className="min-w-0">
                              <span className={autoCall ? 'text-blue-700 dark:text-blue-300 font-medium' : 'text-slate-600 dark:text-slate-300'}>{tool.name}</span>
                              {tool.description && <p className="text-slate-400 mt-0.5 break-all">{tool.description}</p>}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <button
            onClick={() => {
              const newServer: McpServerConfig = {
                id: `mcp-${Date.now()}`,
                name: '',
                url: '',
                authToken: '',
                enabled: true,
                autoCallTools: [],
              };
              updateAi({ mcpServers: [...ai.mcpServers, newServer] });
            }}
            className="w-full py-2.5 text-sm rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 transition-colors"
          >
            + 添加 MCP 服务器
          </button>

          {ai.mcpServers.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-2">
              暂未配置 MCP 服务器。添加后可在研判时自动查询资产信息等。
            </p>
          )}
        </Section>

        {/* ====== 情报富化 ====== */}
        <Section title="情报富化" description="AI 研判前自动查询免费公开情报源（abuse.ch 三件套 / CISA KEV / NVD / Cloudflare DoH / 本地 ip2region 归属），结果注入研判上下文。需 Key 的源未配置 Key 时自动跳过，不影响其他功能。">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-700 dark:text-slate-300">启用情报富化</div>
              <p className="text-xs text-slate-400 mt-0.5">关闭后研判不查询任何外部情报源</p>
            </div>
            <Toggle checked={ai.enrichment.enabled} onChange={(v) => updateAi({ enrichment: { ...ai.enrichment, enabled: v } })} />
          </div>

          <div className="pt-2">
            <label className={labelCls}>免 Key 数据源</label>
            <div className="space-y-2">
              {([
                ['urlhaus', 'URLhaus', '恶意 URL 分发域名查询（abuse.ch）'],
                ['threatfox', 'ThreatFox', 'IOC 关联家族/APT 情报（abuse.ch）'],
                ['malwareBazaar', 'MalwareBazaar', '样本哈希家族识别（abuse.ch）'],
                ['kev', 'CISA KEV', '已知被利用漏洞清单比对'],
                ['nvd', 'NVD', 'CVE 详情与 CVSS 评分'],
                ['doh', 'DoH 解析', '域名 A 记录解析（Cloudflare），与工单 IP 交叉验证'],
                ['ipLocale', 'IP 归属（本地）', '内置 ip2region 离线库，无需网络无需 Key'],
              ] as Array<[keyof typeof ai.enrichment, string, string]>).map(([key, name, desc]) => (
                <div key={key} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-slate-700 dark:text-slate-300">{name}</div>
                    <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                  </div>
                  <Toggle
                    checked={Boolean(ai.enrichment[key])}
                    onChange={(v) => updateAi({ enrichment: { ...ai.enrichment, [key]: v } })}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2">
            <label className={labelCls}>
              API Key 数据源
              <span className="font-normal text-xs text-slate-400 ml-1">留空 = 自动跳过该源</span>
            </label>
            <div className="space-y-3">
              {([
                ['vtApiKey', 'VirusTotal', 'virustotal.com 免费注册获取（4 次/分、500 次/天）'],
                ['abuseIpdbKey', 'AbuseIPDB', 'abuseipdb.com 免费注册获取（1000 次/天）'],
                ['urlscanKey', 'urlscan.io', 'urlscan.io 免费注册获取'],
              ] as Array<[keyof typeof ai.enrichment, string, string]>).map(([key, name, desc]) => (
                <div key={key}>
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-2">
                    {name}
                    {(ai.enrichment[key] as string) ? (
                      <span className="text-green-500">已配置 ✓</span>
                    ) : (
                      <span className="text-slate-400">未配置（跳过）</span>
                    )}
                  </label>
                  <input
                    type="password" autoComplete="off"
                    value={ai.enrichment[key] as string}
                    onChange={(e) => updateAi({ enrichment: { ...ai.enrichment, [key]: e.target.value } })}
                    placeholder={desc}
                    className={inputCls}
                  />
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-slate-400">
            同一 IOC 查询结果缓存 24 小时（DNS 1h / CVE 7 天），免费额度内可放心使用；每类 IOC 单次研判最多查 3 条。
          </p>
        </Section>

        {/* Footer spacer */}
        <div className="h-12" />
      </main>
    </div>
  );
}
