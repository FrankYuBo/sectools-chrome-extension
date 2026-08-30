import React from 'react';
import type { AppSettings, ThemeMode, HashAlgorithm, TimestampUnit, IntelSourceType } from '../../types';
import { INTEL_SOURCES } from '../../utils/intel-sources';
import { validateSelectionRules } from '../../utils/selection-filter';
import type { SelectionRulesValidation } from '../../utils/selection-filter';
import Toggle from './Toggle';

interface SettingsPanelProps {
  settings: AppSettings;
  onUpdateSettings: (partial: Partial<AppSettings>) => void;
  onClose: () => void;
}

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

// 名单文本 → 逐行数组（去首尾空格、去空行）
const splitRuleLines = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  onUpdateSettings,
  onClose,
}) => {
  // 名名单文本编辑态：textarea 保留原始换行便于输入，保存时归一化（去空行/首尾空格）
  const [whitelistText, setWhitelistText] = React.useState(settings.selectionToolbarRules.join('\n'));
  const [blacklistText, setBlacklistText] = React.useState(settings.selectionToolbarBlockRules.join('\n'));

  const whitelistVal = validateSelectionRules(splitRuleLines(whitelistText));
  const blacklistVal = validateSelectionRules(splitRuleLines(blacklistText));
  const blacklistIneffective =
    whitelistVal.rules.length > 0 &&
    (blacklistVal.rules.length > 0 || blacklistVal.issues.length > 0);

  const renderRuleIssues = (val: SelectionRulesValidation): React.ReactNode =>
    val.issues.length === 0 ? null : (
      <div className="text-2xs text-red-500 dark:text-red-400 mt-1 space-y-0.5">
        {val.issues.slice(0, 5).map((iss) => (
          <div key={`${iss.line}-${iss.raw.slice(0, 20)}`}>
            第 {iss.line} 行：{iss.reason}（该行已忽略）
          </div>
        ))}
        {val.issues.length > 5 && <div>…共 {val.issues.length} 条非法行</div>}
      </div>
    );

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">设置</h2>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Settings list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Theme */}
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            主题模式
          </label>
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onUpdateSettings({ themeMode: opt.value })}
                className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${
                  settings.themeMode === opt.value
                    ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 font-medium shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Auto copy */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-700 dark:text-slate-300">自动复制结果</span>
          <Toggle checked={settings.autoCopyResult} onChange={(v) => onUpdateSettings({ autoCopyResult: v })} size="sm" />
        </div>

        {/* Default hash algorithm */}
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            默认哈希算法
          </label>
          <select
            value={settings.defaultHashAlgorithm}
            onChange={(e) => onUpdateSettings({ defaultHashAlgorithm: e.target.value as HashAlgorithm })}
            className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none"
          >
            {HASH_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Default timestamp unit */}
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            时间戳默认单位
          </label>
          <select
            value={settings.timestampDefaultUnit}
            onChange={(e) => onUpdateSettings({ timestampDefaultUnit: e.target.value as TimestampUnit })}
            className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none"
          >
            {TS_UNIT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Indent size */}
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            缩进空格数
          </label>
          <input
            type="number"
            min={1}
            max={8}
            value={settings.indentSize}
            onChange={(e) => {
              const v = Math.max(1, Math.min(8, parseInt(e.target.value) || 2));
              onUpdateSettings({ indentSize: v });
            }}
            className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none"
          />
        </div>

        {/* Max decode depth */}
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            多层解码最大深度
          </label>
          <input
            type="number"
            min={1}
            max={20}
            value={settings.maxDecodeDepth}
            onChange={(e) => {
              const v = Math.max(1, Math.min(20, parseInt(e.target.value) || 10));
              onUpdateSettings({ maxDecodeDepth: v });
            }}
            className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none"
          />
        </div>

        {/* Divider */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-700" />

        {/* Selection toolbar site filter（白名单优先 + 黑名单兜底） */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              选中文本浮动工具栏
            </span>
            <Toggle
              checked={settings.selectionToolbarEnabled}
              onChange={(v) => onUpdateSettings({ selectionToolbarEnabled: v })}
              size="sm"
            />
          </div>

          <p className="text-2xs text-slate-400 dark:text-slate-500">
            默认全部页面弹框；白名单非空时仅命中页面弹框；白名单为空且黑名单非空时命中黑名单的页面不弹。此设置不影响右键菜单。
          </p>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-2xs font-medium text-slate-500 dark:text-slate-400">
                白名单（命中才弹）
              </label>
              <span className="text-2xs text-slate-400 dark:text-slate-500">
                有效 {whitelistVal.rules.length} 条
              </span>
            </div>
            <textarea
              rows={4}
              spellCheck={false}
              value={whitelistText}
              placeholder={'*.corp.internal\n10.0.0.0/8\n172.16.5.4\n/^dev-/i'}
              onChange={(e) => {
                setWhitelistText(e.target.value);
                onUpdateSettings({ selectionToolbarRules: splitRuleLines(e.target.value) });
              }}
              className="w-full text-2xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none resize-y"
            />
            <p className="text-2xs text-slate-400 dark:text-slate-500 mt-1">
              一行一条：纯域名（含子域）/ *.通配符 / CIDR 或单 IP / 正则（仅 i 标志）；* 单独一行表示全部页面
            </p>
            {renderRuleIssues(whitelistVal)}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-2xs font-medium text-slate-500 dark:text-slate-400">
                黑名单（命中不弹，仅白名单为空时生效）
              </label>
              <span className="text-2xs text-slate-400 dark:text-slate-500">
                有效 {blacklistVal.rules.length} 条
              </span>
            </div>
            <textarea
              rows={3}
              spellCheck={false}
              value={blacklistText}
              placeholder={'mail.corp.internal\n*.google.com'}
              onChange={(e) => {
                setBlacklistText(e.target.value);
                onUpdateSettings({ selectionToolbarBlockRules: splitRuleLines(e.target.value) });
              }}
              className="w-full text-2xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none resize-y"
            />
            {renderRuleIssues(blacklistVal)}
          </div>

          {blacklistIneffective && (
            <div className="text-2xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-md px-2 py-1.5">
              当前白名单非空，黑名单不生效（白名单优先）。如需「全部弹框仅排除部分页面」，请清空白名单、只填黑名单。
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-700" />

        {/* Default Intel Sources */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              情报源默认勾选
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  onUpdateSettings({
                    defaultIntelSources: INTEL_SOURCES.slice(0, 10).map((s) => s.id),
                  })
                }
                className="text-2xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
              >
                全选
              </button>
              <span className="text-slate-300 dark:text-slate-600">|</span>
              <button
                onClick={() => onUpdateSettings({ defaultIntelSources: [] })}
                className="text-2xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              >
                清空
              </button>
            </div>
          </div>
          <div className="text-2xs text-slate-400 dark:text-slate-500 mb-2">
            已选 {settings.defaultIntelSources.length} / 10
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {INTEL_SOURCES.slice(0, 10).map((src) => {
              const checked = settings.defaultIntelSources.includes(src.id);
              return (
                <label
                  key={src.id}
                  className={`flex items-center gap-1.5 text-2xs px-2 py-1.5 rounded-md border cursor-pointer transition-all ${
                    checked
                      ? 'border-primary-300 dark:border-primary-600 bg-primary-50 dark:bg-primary-500/10'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const cur = new Set(settings.defaultIntelSources);
                      if (e.target.checked) {
                        cur.add(src.id as IntelSourceType);
                      } else {
                        cur.delete(src.id as IntelSourceType);
                      }
                      onUpdateSettings({ defaultIntelSources: Array.from(cur) });
                    }}
                    className="w-3 h-3 rounded text-primary-500 border-slate-300 dark:border-slate-600 focus:ring-primary-500 focus:ring-1"
                  />
                  <span className="shrink-0">{src.icon}</span>
                  <span
                    className={`truncate ${
                      checked
                        ? 'text-primary-700 dark:text-primary-300 font-medium'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                    title={src.name}
                  >
                    {src.name}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {/* 更多配置 */}
      <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
        <button
          onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('src/settings-page/index.html') })}
          className="w-full text-xs py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-primary-600 dark:hover:text-primary-400 hover:border-primary-300 dark:hover:border-primary-600 transition-all flex items-center justify-center gap-1.5"
        >
          更多配置
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
    </div>
  );
};

export default SettingsPanel;
