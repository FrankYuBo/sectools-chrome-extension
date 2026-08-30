// ============================================================
// SecTools - 全局类型定义
// 由 .spec/project.spec.yaml 的 global_types 驱动生成
// ============================================================

// --- ToolResult：所有工具函数的统一返回类型 ---
export interface ToolResult<T = string> {
  success: boolean;
  data: T;
  error: string | null;
  metadata: Record<string, string> | null;
}

// --- TabConfig：每个工具 Tab 的配置 ---
export interface TabConfig {
  id: string;
  label: string;
  icon: string;
  description: string;
}

// --- SubTabConfig：子 Tab 配置 ---
export interface SubTabConfig {
  id: string;
  label: string;
  description?: string;
}

// --- ModuleManifest：模块清单项 ---
export interface ModuleManifest {
  id: string;
  name: string;
  spec: string;
  tabs: TabConfig[];
}

// --- 编解码方向 ---
export type CodecDirection = 'encode' | 'decode';

// --- 编解码变体 ---
export type Base64Variant = 'standard' | 'urlsafe';

// --- 多层级解码层 ---
export interface DecodeLayer {
  layer: number;
  detected: string;
  result: string;
}

export interface MultiLayerDecodeResult {
  layers: DecodeLayer[];
}

// --- 哈希算法 ---
export type HashAlgorithm = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';

// --- 哈希输出编码 ---
export type HashEncoding = 'hex' | 'base64';

// --- AES 模式 ---
export type AesMode = 'GCM' | 'CBC';
// 别名，兼容 crypto-hash 内部使用
export type AESCipherMode = AesMode;

// --- AES 密钥派生方式 ---
export type KeyDerivation = 'raw' | 'pbkdf2';

// --- JSON 格式化选项 ---
export interface JsonFormatOptions {
  indentSize: number;
  sortKeys: boolean;
}

// --- JSON 校验结果 ---
export interface JsonValidateResult {
  valid: boolean;
  errorLine: number | null;
  errorColumn: number | null;
  errorMessage: string | null;
}

// --- JSON Path 查询结果 ---
export interface JsonPathResult {
  path: string;
  value: string;
}

// --- JSON Diff 差异项 ---
export interface JsonDiffItem {
  path: string;
  type: 'added' | 'removed' | 'changed';
  oldValue?: string;
  newValue?: string;
}

// --- Python 字面量类型 ---
export type PythonLiteralType = 'dict' | 'list' | 'set' | 'tuple' | 'unknown';

// --- Python 字面量格式化结果 ---
export interface PythonLiteralFormatResult {
  formatted: string;
  detectedType: PythonLiteralType;
  originalLanguage: 'python' | 'unknown';
}

// --- Python 字面量输出格式 ---
export type PythonOutputFormat = 'json' | 'python-pretty';

// --- SQL 方言 ---
export type SqlDialect = 'standard' | 'mysql' | 'postgresql';

// --- SQL 大小写 ---
export type SqlKeywordCase = 'upper' | 'lower';

// --- 时间戳单位 ---
export type TimestampUnit = 's' | 'ms' | 'us' | 'ns' | 'auto';

// --- 时间戳转换结果 ---
export interface TimestampHumanResult {
  datetime: string;
  iso8601: string;
  rfc3339: string;
  weekday: string;
  unitDetected: string;
}

// --- 时间信息（含多格式输出） ---
export interface DateTimeInfo {
  timestamp: string;
  detectedUnit: string;
  iso8601: string;
  local: string;
  utc: string;
  datetime: string;  // YYYY-MM-DD HH:mm:ss 本地时间
  unixSeconds: number;
  unixMillis: number;
}

// --- 时间戳输出结果 ---
export interface HumanTimestampResult {
  timestampS: number;
  timestampMs: number;
}

// --- 进制位运算操作符 ---
export type BitwiseOperator = 'AND' | 'OR' | 'XOR' | 'NOT' | 'SHL' | 'SHR';
// 别名，兼容 number-base 内部使用
export type BitOp = 'AND' | 'OR' | 'XOR' | 'NOT' | 'LSHIFT' | 'RSHIFT';

// --- 位运算结果 ---
export interface BitwiseResult {
  resultHex: string;
  resultDec: string;
  resultBin: string;
}

// --- 进制操作数类型 ---
export type OperandBase = 'hex' | 'dec';

// --- 快速四进制转换结果 ---
export interface QuickConversion {
  bin: string;
  oct: string;
  dec: string;
  hex: string;
}

// --- 快速进制基数 ---
export type QuickBase = 2 | 8 | 10 | 16;

// --- 二进制视图模式 ---
export type BinaryViewMode = 'binary' | 'hex' | 'both';

// --- 右键菜单动作定义 ---
export interface ContextMenuAction {
  id: string;
  title: string;
  contexts: chrome.contextMenus.ContextType[];
  action: string;
  onResult: 'copy_to_clipboard' | 'show_notification' | 'both';
}

// --- 右键菜单子菜单 ---
export interface ContextMenuGroup {
  id: string;
  title: string;
  children: string[];
}

// --- 右键菜单配置 ---
export interface ContextMenuSettings {
  enabled: boolean;
  showNotification: boolean;
  autoCopy: boolean;
}

// --- 剪贴板动作类型 ---
export type ClipboardActionMode = 'copy_to_clipboard';

// --- 通知配置 ---
export interface NotificationConfig {
  maxPreviewLength: number;
}

// --- 主题模式 ---
export type ThemeMode = 'system' | 'light' | 'dark';

// --- 版本更新检查结果 ---
export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
}

// --- AI 聊天消息 ---
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// --- MCP 服务器配置 ---
export interface McpServerConfig {
  /** 唯一 ID */
  id: string;
  /** 显示名称 */
  name: string;
  /** MCP Server URL（Streamable HTTP endpoint） */
  url: string;
  /** Bearer Token（可选） */
  authToken: string;
  /** 是否启用 */
  enabled: boolean;
  /** 研判时自动调用的工具名列表；空 = 不自动调用 */
  autoCallTools: string[];
}

// --- MCP 工具定义（从服务器获取） ---
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// --- MCP 工具调用结果 ---
export interface McpToolResult {
  serverName: string;
  toolName: string;
  success: boolean;
  content: string;
  duration: number;
}

// --- 自定义脱敏规则 ---
export interface CustomDesensitizeRule {
  id: string;
  label: string;
  pattern: string;
  replacement: string;
  enabled: boolean;
}

// --- 内置脱敏规则 ID ---
export type BuiltInDesensitizeRuleId =
  | 'ipv4' | 'ipv6' | 'domain' | 'email' | 'phone_cn' | 'idcard_cn' | 'hash';

// --- 内置脱敏规则默认开关 ---
export const DEFAULT_DESENSITIZE_BUILTIN: Record<BuiltInDesensitizeRuleId, boolean> = {
  ipv4: true,
  ipv6: true,
  domain: true,
  email: true,
  phone_cn: true,
  idcard_cn: true,
  hash: true,
};

// --- AI 研判配置 ---
export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  promptTemplate: string;
  domParentSelector: string;
  /** 聊天组件站点白名单（一行一条；非空时命中才启用） */
  chatWidgetSites: string[];
  /** 已获取的模型列表（持久化，供聊天对话框切换） */
  modelList: string[];
  /** 脱敏总开关 */
  desensitizeEnabled: boolean;
  /** 内置脱敏规则开关 */
  builtInDesensitizeRules: Record<BuiltInDesensitizeRuleId, boolean>;
  /** 自定义脱敏正则规则 */
  customDesensitizeRules: CustomDesensitizeRule[];
  /** MCP 服务器列表 */
  mcpServers: McpServerConfig[];
  /** 研判情报富化配置 */
  enrichment: EnrichmentConfig;
}

// --- 情报富化（免费 API + 本地实现） ---
export interface EnrichmentConfig {
  /** 总开关 */
  enabled: boolean;
  /** 无 Key 数据源（abuse.ch / CISA / NVD / Cloudflare） */
  urlhaus: boolean;
  threatfox: boolean;
  malwareBazaar: boolean;
  kev: boolean;
  nvd: boolean;
  doh: boolean;
  /** 本地 IP 归属（ip2region 离线库，无需网络无需 Key） */
  ipLocale: boolean;
  /** 需要 Key 的数据源（留空 = 自动跳过该源，不影响其他功能） */
  vtApiKey: string;
  abuseIpdbKey: string;
  urlscanKey: string;
}

export const DEFAULT_ENRICHMENT_CONFIG: EnrichmentConfig = {
  enabled: true,
  urlhaus: true,
  threatfox: true,
  malwareBazaar: true,
  kev: true,
  nvd: true,
  doh: true,
  ipLocale: true,
  vtApiKey: '',
  abuseIpdbKey: '',
  urlscanKey: '',
};

export const DEFAULT_AI_CONFIG: AiConfig = {
  baseUrl: '',
  apiKey: '',
  model: '',
  promptTemplate: `# Role
你是一名资深安全运营（SOC）分析专家，负责协助安全运营人员进行安全告警研判、应急处置建议以及检测规则调优。

# Task
用户会输入告警日志，请严格基于输入内容完成以下分析：
1. **风险定性与 ATT&CK 映射**：判定风险等级与攻击阶段，精准映射 MITRE ATT&CK 战术与技术标签（附标准编号）。
2. **核心 IOC 提取**：整理出 IP、域名、进程链、命令行、文件 Hash、异常账号等实体。
3. **处置与取证建议**：按“遏制-排查-加固”优先级给出可执行动作。

# Principles & Constraints
- **严禁虚构**：仅基于输入字段事实推导，字段缺失时在“补充调查建议”中明确指出，严禁编造不存在的日志上下文。
- **高可读性与结构化**：输出采用清晰的 Markdown 格式，所有 IOC、路径、命令行、ATT&CK 编号及加白字段均用行内代码（反引号 \` \`）标注。

# Output Format Template
请严格按以下模板格式输出（无相关内容填“无”或省略相应细项）：

### 1. 告警研判结论
- **风险等级**：[高危 / 中危 / 低危 / 疑似误报]
- **攻击类型**：[具体攻击类型，如：Webshell 写入 / 凭据转储 / C2 通信]
- **MITRE ATT&CK**：
  - **战术 (Tactics)**：\`TAxxxx - 战术名称\`
  - **技术 (Techniques)**：\`Txxxx.xxx - 技术名称\`
- **研判依据**：[1-2 句话概括告警触发的核心异常逻辑与行为上下文]

### 2. 关键 IOC 提取
- **网络**：\`IP:端口\` / \`域名\`
- **系统/进程**：\`进程路径\` / \`执行命令行\` / \`父进程\`
- **文件/凭据**：\`文件路径\` / \`MD5/SHA256\` / \`涉及账号\`

### 3. 建议处置动作
- **遏制阻断**：[如：网络隔离主机 / 封禁 IP / 阻断进程]
- **排查与取证**：[如：内存镜像提取 / 检查自启动项 / 导出安全日志]
- **加固修复**：[如：重置账号凭据 / 修补漏洞 / 策略收敛]

### 4. 补充调查建议 (如有信息缺失)
- [列出当前告警缺失但深入研判/加白确认所需的数据]

---

{{content}}`,
  domParentSelector: '',
  chatWidgetSites: [],
  modelList: [],
  desensitizeEnabled: false,
  builtInDesensitizeRules: { ...DEFAULT_DESENSITIZE_BUILTIN },
  customDesensitizeRules: [],
  mcpServers: [],
  enrichment: { ...DEFAULT_ENRICHMENT_CONFIG },
};

// --- Tab ID 类型 ---
export type TabId = 'intel' | 'url' | 'encode' | 'crypto' | 'regex' | 'network' | 'format' | 'timestamp' | 'number' | 'generator';

export const ALL_TAB_IDS: TabId[] = [
  'intel', 'url', 'encode', 'crypto', 'regex', 'network', 'format', 'timestamp', 'number', 'generator',
];

export const CORE_TAB_IDS: readonly TabId[] = [
  'intel', 'url', 'encode', 'crypto', 'regex', 'network',
] as const;

export const DEFAULT_TAB_ORDER: TabId[] = [...ALL_TAB_IDS];

// --- 用户设置持久化结构 ---
export interface AppSettings {
  themeMode: ThemeMode;
  autoCopyResult: boolean;
  maxDecodeDepth: number;
  defaultHashAlgorithm: HashAlgorithm;
  indentSize: number;
  timestampDefaultUnit: TimestampUnit;
  defaultIntelSources: IntelSourceType[];
  /** 选中文本浮动工具栏总开关（仅控制浮动工具栏，不影响右键菜单） */
  selectionToolbarEnabled: boolean;
  /** 浮动工具栏白名单（一行一条；非空时命中才启用，黑名单失效） */
  selectionToolbarRules: string[];
  /** 浮动工具栏黑名单（一行一条；仅白名单为空时生效：默认启用、命中不启用） */
  selectionToolbarBlockRules: string[];
  /** Tab 面板排序顺序 */
  tabOrder: TabId[];
  /** 被隐藏的 Tab ID 列表 */
  hiddenTabs: TabId[];
  /** AI 研判配置 */
  aiConfig: AiConfig;
}

// --- 设置默认值 ---
export const DEFAULT_SETTINGS: AppSettings = {
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

// ============================================================
// IOC 检测 / 威胁情报 类型定义
// ============================================================

// --- IOC 类型枚举 ---
export type IocType =
  | 'ipv4'
  | 'ipv6'
  | 'domain'
  | 'url'
  | 'email'
  | 'md5'
  | 'sha1'
  | 'sha256'
  | 'sha512'
  | 'cve'
  | 'as'
  | 'bitcoin'
  | 'ethereum'
  | 'mac';

// --- IOC 匹配条目 ---
export interface IocMatch {
  type: IocType;
  value: string;
  start: number;
  end: number;
  context?: string;
}

// --- IOC 检测结果 ---
export interface IocDetectResult {
  matches: IocMatch[];
  stats: Record<IocType, number>;
  total: number;
}

// --- IOC 正则模式定义 ---
export interface IocRegexPattern {
  type: IocType;
  label: string;
  pattern: RegExp;
  description: string;
  priority: number;
  validator?: (value: string) => boolean;
}

// --- 情报源类型 ---
export type IntelSourceType =
  | 'virustotal'
  | 'threatbook'
  | 'alienvault'
  | 'hybrid-analysis'
  | 'urlscan'
  | 'abuseipdb'
  | 'shodan'
  | 'censys'
  | 'anyrun'
  | 'triage';

// --- 情报源查询参数 ---
export interface IntelQueryParams {
  type: IocType;
  value: string;
}

// --- 情报源定义 ---
export interface IntelSource {
  id: IntelSourceType;
  name: string;
  nameEn: string;
  description: string;
  icon: string;
  color: string;
  homepage: string;
  supportedTypes: IocType[];
  buildUrl: (params: IntelQueryParams) => string | null;
}

// --- 情报分类搜索结果 ---
export interface IntelSearchLinks {
  source: IntelSourceType;
  name: string;
  url: string;
}

// --- 模块清单扩展：IOC / 威胁情报模块 ---
export interface IocModuleManifest {
  id: 'ioc-detector';
  name: string;
  spec: string;
  tabs: TabConfig[];
  regexPatterns: IocRegexPattern[];
  intelSources: IntelSourceType[];
}
