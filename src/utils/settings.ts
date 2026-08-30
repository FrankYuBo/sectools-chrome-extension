// ============================================================
// 设置模块 — 实现
// 由 .spec/settings.spec.yaml 驱动
// ============================================================
import type { AppSettings, ThemeMode, CustomDesensitizeRule, McpServerConfig } from '../types';
import { DEFAULT_AI_CONFIG, DEFAULT_TAB_ORDER } from '../types';

// ================================================================
// Storage Schema 版本化 + 迁移框架
// 每次新增/删除 AppSettings 字段时：SETTINGS_SCHEMA_VERSION++，
// 并在 migrate() 中追加对应迁移步骤，确保老用户升级零崩溃
// ================================================================

export const SETTINGS_SCHEMA_VERSION = 7 as const;
const STORAGE_KEY_SETTINGS = 'appSettings' as const;
const STORAGE_KEY_SCHEMA_VERSION = 'appSettingsSchemaVersion' as const;

/**
 * 历史版本的默认提示词模板。
 * v6 迁移时：如果用户存储的模板 === 某个历史默认值（即从未自定义过），
 * 自动升级为最新默认模板；如果用户改过，则保留用户版本不动。
 */
const LEGACY_DEFAULT_PROMPT_TEMPLATES: string[] = [
  '你是一位资深安全运营工程师。请对以下工单/告警内容进行安全研判，给出：1. 事件分类 2. 严重程度 3. 关键指标 4. 处置建议。\n\n内容：\n{{content}}',
];

/** 判断模板是否为历史默认值（从未自定义） */
export function isLegacyDefaultPromptTemplate(template: string): boolean {
  const t = template.trim();
  return LEGACY_DEFAULT_PROMPT_TEMPLATES.some((legacy) => legacy.trim() === t);
}

type MigrationFn = (oldSettings: Partial<AppSettings>) => Partial<AppSettings>;

const MIGRATIONS: Array<{ from: number; to: number; up: MigrationFn }> = [
  {
    // v2：选中文本浮动工具栏名单过滤（白名单优先 + 黑名单兜底）
    from: 1,
    to: 2,
    up: (old) => ({
      ...old,
      selectionToolbarEnabled: true, // 默认开启，名单为空 → 全部页面显示工具栏
      selectionToolbarRules: [],
      selectionToolbarBlockRules: [],
    }),
  },
  {
    // v3：Tab 排序/隐藏 + AI 研判配置
    from: 2,
    to: 3,
    up: (old) => ({
      ...old,
      tabOrder: [...DEFAULT_TAB_ORDER],
      hiddenTabs: [],
      aiConfig: { ...DEFAULT_AI_CONFIG },
    }),
  },
  {
    // v4：AI 脱敏规则 + 聊天组件白名单
    from: 3,
    to: 4,
    up: (old) => {
      const prev = (old.aiConfig ?? {}) as unknown as Record<string, unknown>;
      return {
        ...old,
        aiConfig: {
          ...DEFAULT_AI_CONFIG,
          ...(old.aiConfig ?? {}),
          chatWidgetSites: Array.isArray(prev.chatWidgetSites)
            ? (prev.chatWidgetSites as string[])
            : DEFAULT_AI_CONFIG.chatWidgetSites,
          desensitizeEnabled: typeof prev.desensitizeEnabled === 'boolean'
            ? (prev.desensitizeEnabled as boolean)
            : DEFAULT_AI_CONFIG.desensitizeEnabled,
          builtInDesensitizeRules: {
            ...DEFAULT_AI_CONFIG.builtInDesensitizeRules,
            ...(prev.builtInDesensitizeRules as Record<string, boolean> ?? {}),
          },
          customDesensitizeRules: Array.isArray(prev.customDesensitizeRules)
            ? (prev.customDesensitizeRules as CustomDesensitizeRule[])
            : DEFAULT_AI_CONFIG.customDesensitizeRules,
        },
      };
    },
  },
  {
    // v5：MCP 服务器配置
    from: 4,
    to: 5,
    up: (old) => {
      const prev = (old.aiConfig ?? {}) as unknown as Record<string, unknown>;
      return {
        ...old,
        aiConfig: {
          ...DEFAULT_AI_CONFIG,
          ...(old.aiConfig ?? {}),
          mcpServers: Array.isArray(prev.mcpServers)
            ? (prev.mcpServers as McpServerConfig[])
            : DEFAULT_AI_CONFIG.mcpServers,
        },
      };
    },
  },
  {
    // v6：默认提示词模板升级为 SOC 分析专家模板
    // 仅当用户存储的模板是旧默认值（从未自定义）时替换；自定义模板保持不变
    from: 5,
    to: 6,
    up: (old) => {
      const prev = (old.aiConfig ?? {}) as unknown as Record<string, unknown>;
      const storedTemplate = typeof prev.promptTemplate === 'string' ? prev.promptTemplate : '';
      const shouldUpgrade =
        !storedTemplate || isLegacyDefaultPromptTemplate(storedTemplate);
      return {
        ...old,
        aiConfig: {
          ...DEFAULT_AI_CONFIG,
          ...(old.aiConfig ?? {}),
          promptTemplate: shouldUpgrade
            ? DEFAULT_AI_CONFIG.promptTemplate
            : storedTemplate,
        },
      };
    },
  },
  {
    // v7：研判情报富化（免费 API + 本地 ip2region，Key 型源无 Key 自动跳过）
    from: 6,
    to: 7,
    up: (old) => {
      const prev = (old.aiConfig ?? {}) as unknown as Record<string, unknown>;
      return {
        ...old,
        aiConfig: {
          ...DEFAULT_AI_CONFIG,
          ...(old.aiConfig ?? {}),
          enrichment: {
            ...DEFAULT_AI_CONFIG.enrichment,
            ...((prev.enrichment as Record<string, unknown>) ?? {}),
          },
        },
      };
    },
  },
];

function migrate(
  currentVersion: number,
  targetVersion: number,
  settings: Partial<AppSettings>,
): Partial<AppSettings> {
  let cur = currentVersion;
  let acc = { ...settings };
  while (cur < targetVersion) {
    const step = MIGRATIONS.find((m) => m.from === cur);
    if (!step) break;
    acc = step.up(acc);
    cur = step.to;
  }
  return acc;
}

// ================================================================
// 默认设置
// ================================================================

const DEFAULT_SETTINGS: AppSettings = {
  themeMode: 'system',
  autoCopyResult: true,
  maxDecodeDepth: 10,
  defaultHashAlgorithm: 'SHA-256',
  indentSize: 2,
  timestampDefaultUnit: 's',
  defaultIntelSources: [
    'virustotal',
    'threatbook',
  ],
  selectionToolbarEnabled: true,
  selectionToolbarRules: [],
  selectionToolbarBlockRules: [],
  tabOrder: [...DEFAULT_TAB_ORDER],
  hiddenTabs: [],
  aiConfig: { ...DEFAULT_AI_CONFIG },
};

// ================================================================
// chrome.storage.local 读写包装（含 Schema 版本化 + 迁移）
// ================================================================

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await chrome.storage.local.get([
      STORAGE_KEY_SETTINGS,
      STORAGE_KEY_SCHEMA_VERSION,
    ]);

    const storedSettings: Partial<AppSettings> | undefined =
      raw[STORAGE_KEY_SETTINGS] && typeof raw[STORAGE_KEY_SETTINGS] === 'object'
        ? (raw[STORAGE_KEY_SETTINGS] as Partial<AppSettings>)
        : undefined;

    const storedVersion =
      typeof raw[STORAGE_KEY_SCHEMA_VERSION] === 'number'
        ? raw[STORAGE_KEY_SCHEMA_VERSION]
        : 0; // 无 schema 版本记录 → 视为版本 0

    let effectiveSettings = storedSettings ?? {};
    // 需要迁移 → 跑迁移链
    if (storedVersion < SETTINGS_SCHEMA_VERSION) {
      effectiveSettings = migrate(storedVersion, SETTINGS_SCHEMA_VERSION, effectiveSettings);
      // 升级后立即回写，避免下次再迁移
      try {
        await chrome.storage.local.set({
          [STORAGE_KEY_SETTINGS]: { ...DEFAULT_SETTINGS, ...effectiveSettings },
          [STORAGE_KEY_SCHEMA_VERSION]: SETTINGS_SCHEMA_VERSION,
        });
      } catch {
        // 回写失败不影响读取，只返回内存中的最新值
      }
    }

    // 合并 DEFAULT_SETTINGS，保证新增字段（即使忘了写迁移步骤）也有兜底值
    const merged: AppSettings = { ...DEFAULT_SETTINGS, ...effectiveSettings };
    return merged;
  } catch {
    // 存储读取失败，使用默认值
  }
  return { ...DEFAULT_SETTINGS };
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  const current = await loadSettings();
  const merged = { ...current, ...settings };
  await chrome.storage.local.set({
    [STORAGE_KEY_SETTINGS]: merged,
    [STORAGE_KEY_SCHEMA_VERSION]: SETTINGS_SCHEMA_VERSION,
  });
}

export async function getSetting<K extends keyof AppSettings>(
  key: K,
): Promise<AppSettings[K]> {
  const settings = await loadSettings();
  return settings[key];
}

export async function setSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
): Promise<void> {
  // 走 saveSettings，保证同时更新 schema version；chrome.storage.local 不支持 dot-notation 直接写子键
  await saveSettings({ [key]: value } as Partial<AppSettings>);
}

// ================================================================
// 配置导出 / 导入（跨电脑迁移）
// ================================================================

/** 导出文件结构 */
export interface SettingsExportFile {
  app: 'sectools-chrome-extension';
  schemaVersion: number;
  exportedAt: string;
  settings: Partial<AppSettings>;
}

/**
 * 导出前脱敏：includeSecrets=false 时清空所有密钥类字段
 * （mcpServers[].authToken 逐项清空）。纯函数，可单测。
 */
export function sanitizeSettingsForExport(
  settings: Partial<AppSettings>,
  includeSecrets: boolean,
): Partial<AppSettings> {
  if (includeSecrets) return settings;
  const clone = JSON.parse(JSON.stringify(settings)) as Partial<AppSettings>;
  const ai = clone.aiConfig as Record<string, unknown> | undefined;
  if (ai) {
    ai.apiKey = '';
    const enr = ai.enrichment as Record<string, unknown> | undefined;
    if (enr) {
      enr.vtApiKey = '';
      enr.abuseIpdbKey = '';
      enr.urlscanKey = '';
    }
    if (Array.isArray(ai.mcpServers)) {
      ai.mcpServers = (ai.mcpServers as Array<Record<string, unknown>>).map((s) => ({
        ...s,
        authToken: '',
      }));
    }
  }
  return clone;
}

/** 组装导出文件对象 */
export function buildSettingsExport(
  settings: Partial<AppSettings>,
  includeSecrets: boolean,
): SettingsExportFile {
  return {
    app: 'sectools-chrome-extension',
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings: sanitizeSettingsForExport(settings, includeSecrets),
  };
}

/**
 * 校验导入文件：返回错误信息（null = 合法）。
 * 合法文件：JSON 对象、app 标识匹配、settings 为对象且含 aiConfig。
 * schemaVersion 允许低于当前版本（导入后走迁移链自动升级）。
 */
export function validateSettingsImport(raw: string): { error: string | null; file: SettingsExportFile | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: '不是有效的 JSON 文件', file: null };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { error: '文件结构不正确（应为配置导出 JSON 对象）', file: null };
  }
  const f = parsed as Partial<SettingsExportFile>;
  if (f.app !== 'sectools-chrome-extension') {
    return { error: '不是 SecTools 导出的配置文件（app 标识不匹配）', file: null };
  }
  if (typeof f.settings !== 'object' || f.settings === null || Array.isArray(f.settings)) {
    return { error: '配置内容缺失（settings 字段无效）', file: null };
  }
  const s = f.settings as Record<string, unknown>;
  if (typeof s.aiConfig !== 'object' || s.aiConfig === null) {
    return { error: '配置内容不完整（缺少 aiConfig）', file: null };
  }
  return {
    error: null,
    file: {
      app: 'sectools-chrome-extension',
      schemaVersion: typeof f.schemaVersion === 'number' ? f.schemaVersion : 0,
      exportedAt: typeof f.exportedAt === 'string' ? f.exportedAt : '',
      settings: f.settings as Partial<AppSettings>,
    },
  };
}

/**
 * 应用导入：写入 storage（连同文件内 schemaVersion，
 * 版本低于当前时由 loadSettings 迁移链自动升级）。
 */
export async function applySettingsImport(file: SettingsExportFile): Promise<AppSettings> {
  await chrome.storage.local.set({
    [STORAGE_KEY_SETTINGS]: file.settings,
    [STORAGE_KEY_SCHEMA_VERSION]: file.schemaVersion,
  });
  return loadSettings();
}

// ================================================================
// 设置变更监听
// ================================================================

export type SettingsChangeCallback = (
  key: keyof AppSettings,
  newValue: AppSettings[keyof AppSettings],
  oldValue: AppSettings[keyof AppSettings],
) => void;

export function onSettingsChanged(callback: SettingsChangeCallback): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== 'local') return;

    // 处理直接字段存储
    for (const [key, change] of Object.entries(changes)) {
      if (key === 'appSettings') {
        // 整个对象被更新
        const oldSettings = (change.oldValue ?? {}) as Partial<AppSettings>;
        const newSettings = (change.newValue ?? {}) as Partial<AppSettings>;
        const allKeys = new Set([
          ...Object.keys(oldSettings),
          ...Object.keys(newSettings),
        ]) as Set<keyof AppSettings>;

        for (const k of allKeys) {
          if (oldSettings[k] !== newSettings[k]) {
            callback(k, newSettings[k]!, oldSettings[k]!);
          }
        }
      }
    }
  };

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

// ================================================================
// 主题应用
// ================================================================

export async function applyTheme(theme?: ThemeMode): Promise<ThemeMode> {
  const mode = theme ?? (await getSetting('themeMode'));
  const effective = getEffectiveTheme(mode);

  const root = document.documentElement;
  root.setAttribute('data-theme', effective);

  if (effective === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  return effective;
}

export function getEffectiveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return mode;
}

// ================================================================
// 初始化
// ================================================================

/**
 * 应用启动时初始化设置：
 * 1. 监听系统主题变化（仅在 system 模式下）
 * 2. 应用当前主题
 * 3. 返回当前设置
 */
export async function initSettings(): Promise<AppSettings> {
  const settings = await loadSettings();

  // 应用主题
  const effective = getEffectiveTheme(settings.themeMode);
  const root = document.documentElement;
  root.setAttribute('data-theme', effective);
  if (effective === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  // 监听系统主题变化
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async (e) => {
    const currentMode = await getSetting('themeMode');
    if (currentMode === 'system') {
      const newEffective = e.matches ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', newEffective);
      if (newEffective === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  });

  return settings;
}
