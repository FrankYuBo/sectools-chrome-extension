// ============================================================
// 工具函数统一导出
// ============================================================

// 编解码
export {
  base64Encode,
  base64Decode,
  base32Encode,
  base32Decode,
  hexEncode,
  hexDecode,
  urlEncode,
  urlDecode,
  unicodeEscapeEncode,
  unicodeEscapeDecode,
  htmlEntityEncode,
  htmlEntityDecode,
  jwtDecode,
  multiLayerDecode,
} from './encode-decode';
export type { JwtPayload } from './encode-decode';

// 加密哈希
export {
  computeHash,
  computeHMAC,
  aesEncrypt,
  aesDecrypt,
} from './crypto-hash';

// 格式化
export {
  jsonFormat,
  jsonMinify,
  jsonValidate,
  jsonEscape,
  jsonUnescape,
  jsonPathQuery,
  jsonDiff,
  pythonLiteralFormat,
  sqlFormat,
  xmlFormat,
} from './formatter';

// 时间转换
export {
  timestampToHuman,
  humanToTimestamp,
  getCurrentTimestamp,
  filetimeToHuman,
  humanToFiletime,
} from './timestamp';

// 进制转换
export {
  convertBase,
  quickConvert,
  textToBinaryView,
  bitwiseOp,
} from './number-base';

// 设置
export {
  loadSettings,
  saveSettings,
  getSetting,
  setSetting,
  onSettingsChanged,
  applyTheme,
  getEffectiveTheme,
  initSettings,
} from './settings';
export type { SettingsChangeCallback } from './settings';

// 版本更新
export {
  checkForUpdate,
  getCurrentVersion,
  showUpdateBadge,
  clearUpdateBadge,
  dismissUpdate,
  shouldShowUpdateBanner,
  GITHUB_REPO_URL,
  GITHUB_RELEASES_URL,
} from './version-update';
export type { UpdateCheckResult, DismissLevel } from './version-update';

// 生成器
export {
  generateUuid,
  generatePassword,
  generateRandomString,
  generateRandomInt,
  generateRandomBytes,
  isValidUuid,
} from './generator';
export type { UuidVersion, PasswordOptions } from './generator';

// URL 分析
export {
  analyzeUrl,
  parseUrlOnly,
  analyzeStringEncoding,
  detectEncodingHints,
} from './url-analyzer';
export type {
  ParsedUrl,
  UrlParam,
  UrlQueryParam,
  UrlHashParam,
  EncodingHint,
  EncodingHintType,
  UrlAnalysisResult,
  SecurityWarning,
} from './url-analyzer';

// 同形异义字 / 混淆字符检测
export {
  analyzeHomoglyph,
  cleanConfusableChars,
  listCharDetails,
  hasConfusionRisk,
  punycodeDecodeDomain,
} from './homoglyph';

// 短链跳转链路
export {
  buildRedirectChain,
  extractJsOrMetaRedirect,
} from './redirect-chain';
export type {
  ObservedRedirectEvent,
  RedirectHop,
  RedirectChain,
} from './redirect-chain';
export type {
  ScriptCategory,
  ConfusionSeverity,
  CharScriptInfo,
  ScriptMixInfo,
  InvisibleCharIssue,
  InvisibleCharCategory,
  HomoglyphMatch,
  HomoglyphAnalysisResult,
  PunycodeDecodeResult,
} from './homoglyph';

// IOC 检测 — 内置正则
export {
  BUILTIN_IOC_REGEXES,
  getRegexByType,
  getRegexesByTypes,
  getSortedRegexes,
  IOC_TYPE_META,
} from './builtin-regex';

// IOC 检测 — 核心检测器
export {
  detectIocs,
  extractIocByType,
  extractHashes,
  extractNetworkIocs,
  highlightIocs,
  groupIocsByType,
} from './ioc-detector';
export type { DetectIocsOptions, HighlightedSegment } from './ioc-detector';

// 威胁情报源
export {
  INTEL_SOURCES,
  getIntelSource,
  getIntelSourcesByType,
  buildAllIntelLinks,
  buildIntelLink,
} from './intel-sources';

// 选中文本浮动工具栏 — 页面名单过滤
export {
  parseSelectionRule,
  validateSelectionRules,
  matchSelectionHost,
  shouldShowSelectionToolbar,
  SELECTION_RULE_MAX_LINES,
  SELECTION_RULE_MAX_LINE_LENGTH,
} from './selection-filter';
export type {
  SelectionRule,
  SelectionRuleKind,
  SelectionRuleIssue,
  SelectionRulesValidation,
} from './selection-filter';
