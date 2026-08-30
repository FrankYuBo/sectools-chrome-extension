// ============================================================
// RegexPanel + YaraLint + SigmaLint 独立类型定义
// 不依赖或修改 src/types/index.ts
// ============================================================

// ---- RegexPanel 相关 ----

export type RegexLibraryCategory =
  | 'network'
  | 'malware'
  | 'forensics'
  | 'credential';

export interface RegexPresetItem {
  id: string;
  name: string;
  pattern: string;
  flags?: string;
  description: string;
  example?: string;
}

export interface RegexLibraryGroup {
  category: RegexLibraryCategory;
  label: string;
  icon: string;
  items: RegexPresetItem[];
}

export interface CaptureGroupMatch {
  index: number;
  name: string | null;
  value: string;
  start: number;
  end: number;
}

export interface RegexMatchResult {
  fullMatch: string;
  index: number;
  start: number;
  end: number;
  groups: CaptureGroupMatch[];
}

export interface RegexExecState {
  valid: boolean;
  error: string | null;
  matches: RegexMatchResult[];
  totalMatches: number;
  totalGroups: number;
  execTimeMs: number | null;
}

export type RegexPanelSubTab = 'custom' | 'library' | 'explain';

// ---- YaraLint 相关 ----

export type YaraLintSeverity = 'error' | 'warning' | 'info';

export interface YaraLintIssue {
  severity: YaraLintSeverity;
  line: number | null;
  column: number | null;
  code: string;
  message: string;
  suggestion?: string;
}

export interface YaraLintResult {
  valid: boolean;
  issues: YaraLintIssue[];
  ruleCount: number;
  metaCount: number;
  stringsCount: number;
  hasCondition: boolean;
}

export interface YaraRuleInfo {
  name: string | null;
  tags: string[];
  metaEntries: Array<{ key: string; value: string; line: number }>;
  strings: Array<{ id: string; type: 'text' | 'hex' | 'regex'; value: string; line: number }>;
  condition: string | null;
  conditionLine: number | null;
}

// ---- SigmaLint 相关 ----

export type SigmaLintSeverity = 'error' | 'warning' | 'info';

export interface SigmaLintIssue {
  severity: SigmaLintSeverity;
  line: number | null;
  field: string | null;
  code: string;
  message: string;
  suggestion?: string;
}

export type SigmaLogSourceCategory =
  | 'process_creation'
  | 'network_connection'
  | 'file_event'
  | 'registry_event'
  | 'dns_query'
  | 'driver_load'
  | 'image_load'
  | 'pipe_event'
  | 'wmi_event'
  | 'process_access'
  | 'other';

export interface SigmaLintResult {
  valid: boolean;
  issues: SigmaLintIssue[];
  hasTitle: boolean;
  hasLogSource: boolean;
  hasDetection: boolean;
  hasCondition: boolean;
  logSourceCategory: SigmaLogSourceCategory | null;
  detectionKeys: string[];
  conditionRefs: string[];
  undefinedRefs: string[];
}

// ---- 通用 ----

export interface LintSummary {
  errorCount: number;
  warningCount: number;
  infoCount: number;
}
