// ============================================================
// Popup 组件层级接口
// 由各 .spec/*.yaml 的 ui.component_interface 驱动生成
// ============================================================
import type { AppSettings, ThemeMode, UpdateCheckResult } from '../types';
import type { DismissLevel } from '../utils/version-update';

// --- App 顶级状态 ---
export interface AppState {
  activeTab: string;
  inputText: string;
  outputText: string;
  settings: AppSettings;
  updateInfo: UpdateCheckResult | null;
  showUpdateBanner: boolean;
  showSettingsPanel: boolean;
  showAboutPanel: boolean;
}

// --- 编解码 Tab 状态 ---
export interface EncodeDecodeState {
  activeSubTab: string;
  direction: 'encode' | 'decode';
  error: string | null;
  metadata: Record<string, string> | null;
}

// --- 哈希加密 Tab 状态 ---
export interface CryptoHashState {
  activeSubTab: string;
  algorithm: string;
  encoding: 'hex' | 'base64';
  hmacKey: string;
  aesKey: string;
  aesIv: string;
  aesMode: 'GCM' | 'CBC';
}

// --- 格式化 Tab 状态 ---
export interface FormatterState {
  activeSubTab: string;
  indentSize: number;
  sortKeys: boolean;
}

// --- 时间转换 Tab 状态 ---
export interface TimestampState {
  activeSubTab: string;
  currentTime: string;
}

// --- 进制转换 Tab 状态 ---
export interface NumberBaseState {
  activeSubTab: string;
}

// --- 设置面板 Props ---
export interface SettingsPanelProps {
  settings: AppSettings;
  isOpen: boolean;
  onClose: () => void;
  onThemeChange: (mode: ThemeMode) => void;
  onSettingChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  onOpenAbout: () => void;
}

// --- 版本更新 Banner Props ---
export interface UpdateBannerProps {
  visible: boolean;
  latestVersion: string | null;
  onView: () => void;
  onDismiss: (level: DismissLevel) => void;
}

// --- 关于面板 Props ---
export interface AboutPanelProps {
  isOpen: boolean;
  updateInfo: UpdateCheckResult | null;
  isChecking: boolean;
  onClose: () => void;
  onCheckUpdate: () => void;
}

// --- Popup 组件声明 ---

export interface PopupProps {
  tabs: Array<{ id: string; label: string; icon: string }>;
}

export interface ToolPanelProps {
  inputText: string;
  outputText: string;
  onInputChange: (val: string) => void;
  onCopy: () => void;
  onClear: () => void;
}

// ============================================================
// Tab 切换数据契约
// ============================================================
export const TAB_CONFIG = [
  { id: 'encode-decode', label: '编解码',   icon: '🔤', description: 'Base64/URL/Hex/Unicode/HTML' },
  { id: 'crypto-hash',   label: '哈希加密', icon: '🔐', description: 'Hash/AES/HMAC' },
  { id: 'formatter',     label: '格式化',   icon: '📝', description: 'JSON/XML/SQL/Python' },
  { id: 'timestamp',     label: '时间转换', icon: '🕐', description: '时间戳/日期互转' },
  { id: 'number-base',   label: '进制转换', icon: '🔢', description: '进制/位运算/BinaryView' },
  { id: 'generator',     label: '生成器',   icon: '🎲', description: 'UUID/密码/随机串/整数/字节' },
] as const;

// ============================================================
// 主题配置
// ============================================================
export const THEME_OPTIONS = [
  { value: 'system' as const, label: '跟随系统', icon: '🖥️' },
  { value: 'light' as const,  label: '亮色',     icon: '☀️' },
  { value: 'dark' as const,   label: '暗色',     icon: '🌙' },
] as const;
