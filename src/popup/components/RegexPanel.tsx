import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { usePersistentState } from '../../utils/persistent-state';
import type {
  RegexLibraryCategory,
  RegexLibraryGroup,
  RegexPresetItem,
  RegexMatchResult,
  RegexExecState,
  RegexPanelSubTab,
  CaptureGroupMatch,
} from '../../types/regex-yara-sigma';

interface Props {
  onAutoCopy: (text: string) => void;
}

const REGEX_LIBRARY: RegexLibraryGroup[] = [
  {
    category: 'network',
    label: '网络协议',
    icon: '🌐',
    items: [
      {
        id: 'ipv4',
        name: 'IPv4 地址',
        pattern: '\\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\b',
        flags: 'g',
        description: '匹配 IPv4 地址（含边界校验）',
        example: 'Server IP: 192.168.1.1, Gateway: 10.0.0.1',
      },
      {
        id: 'ipv6',
        name: 'IPv6 地址',
        pattern: '\\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\\b|\\b(?:[0-9a-fA-F]{1,4}:){1,7}:\\b|::(?:[fF]{4}:)?(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)',
        flags: 'gi',
        description: '匹配标准 IPv6 及 IPv4 嵌入形式',
        example: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
      },
      {
        id: 'domain',
        name: '域名',
        pattern: '\\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+(?:com|cn|net|org|io|gov|edu|cc|me|xyz|top|info|biz|tv|co\\.uk|com\\.cn)\\b',
        flags: 'gi',
        description: '匹配常见 TLD 的域名',
        example: 'Visit https://example.com/path?q=1 或 api.test.io',
      },
      {
        id: 'url',
        name: 'URL/URI',
        pattern: '(?:https?|ftp|file)://[-a-zA-Z0-9+&@#/%?=~_|!:,.;]*[-a-zA-Z0-9+&@#/%=~_|]',
        flags: 'gi',
        description: '匹配 HTTP/HTTPS/FTP 协议 URL',
        example: 'https://user:pass@example.com:8080/path?query=1#hash',
      },
      {
        id: 'port',
        name: 'TCP/UDP 端口',
        pattern: '\\b(?:6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[1-9][0-9]{1,3})\\b',
        flags: 'g',
        description: '合法端口号 1-65535',
        example: 'PORT   STATE SERVICE\n22/tcp open  ssh\n443/tcp open  https',
      },
      {
        id: 'mac',
        name: 'MAC 地址',
        pattern: '\\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\\b',
        flags: 'gi',
        description: '匹配冒号或短横线分隔的 MAC',
        example: 'HWaddr 00:1A:2B:3C:4D:5E  or  00-1A-2B-3C-4D-5E',
      },
      {
        id: 'cidr',
        name: 'CIDR 网段',
        pattern: '\\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\/(?:3[0-2]|[12]?[0-9])\\b',
        flags: 'g',
        description: 'CIDR 表示法，掩码 0-32',
        example: 'ALLOW 192.168.0.0/16  DENY 10.0.0.0/8',
      },
      {
        id: 'useragent',
        name: 'User-Agent 提取',
        pattern: 'User-Agent:\\s*([^\\r\\n]+)',
        flags: 'gi',
        description: '提取 HTTP User-Agent 头值（捕获组1）',
        example: 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    ],
  },
  {
    category: 'malware',
    label: '恶意特征',
    icon: '🦠',
    items: [
      {
        id: 'md5',
        name: 'MD5 Hash',
        pattern: '\\b[a-fA-F0-9]{32}\\b',
        flags: 'gi',
        description: '32 位十六进制 MD5',
        example: 'MD5: d41d8cd98f00b204e9800998ecf8427e',
      },
      {
        id: 'sha1',
        name: 'SHA-1 Hash',
        pattern: '\\b[a-fA-F0-9]{40}\\b',
        flags: 'gi',
        description: '40 位十六进制 SHA-1',
        example: 'SHA1: da39a3ee5e6b4b0d3255bfef95601890afd80709',
      },
      {
        id: 'sha256',
        name: 'SHA-256 Hash',
        pattern: '\\b[a-fA-F0-9]{64}\\b',
        flags: 'gi',
        description: '64 位十六进制 SHA-256',
        example: 'SHA256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      },
      {
        id: 'pe-header',
        name: 'PE/DOS 头 MZ',
        pattern: '\\x4d\x5a[\\s\\S]{58,90}\\x50\x45\\x00\\x00',
        flags: 'g',
        description: 'PE 文件头特征（二进制数据中）',
        example: 'MZ.........PE..',
      },
      {
        id: 'elf-header',
        name: 'ELF 文件头',
        pattern: '\\x7fELF[\\x01\\x02][\\x01\\x02]',
        flags: 'g',
        description: 'ELF 魔数 + class + data',
        example: 'ELF 文件头部特征序列',
      },
      {
        id: 'powershell-obf',
        name: 'PowerShell 混淆',
        pattern: '(?:-enc|--e(?:ncode)?d?c?o?m?m?a?n?d?)\\s+["\']?[A-Za-z0-9+/=]{20,}',
        flags: 'gi',
        description: '检测 EncodedCommand 编码参数',
        example: 'powershell -enc SABlAGwAbABvAA==',
      },
      {
        id: 'base64-blob',
        name: '长 Base64 Blob',
        pattern: '[A-Za-z0-9+/]{60,}={0,2}',
        flags: 'g',
        description: '可疑连续长 Base64（≥60字符）',
        example: 'data:application/octet-stream;base64,TVqQAAMAAAAEAAAA//8AALgAAAAAAAAAQAAAAA...',
      },
      {
        id: 'cve-id',
        name: 'CVE 编号',
        pattern: 'CVE-\\d{4}-\\d{4,7}',
        flags: 'gi',
        description: '标准 CVE-ID 格式',
        example: '漏洞 CVE-2024-3400 需紧急修补',
      },
    ],
  },
  {
    category: 'forensics',
    label: '取证分析',
    icon: '🔍',
    items: [
      {
        id: 'win-path',
        name: 'Windows 路径',
        pattern: '(?:[A-Za-z]:|\\\\\\\\[A-Za-z0-9_.$-]+)\\\\(?:[A-Za-z0-9_.$-]+\\\\?)*',
        flags: 'g',
        description: '本地盘符或 UNC 网络路径',
        example: 'C:\\Users\\Admin\\AppData\\Local\\Temp\\a.exe  \\\\srv\\share\\file.doc',
      },
      {
        id: 'unix-path',
        name: 'Unix 路径',
        pattern: '(?:/[A-Za-z0-9_.$-]+)+/?',
        flags: 'g',
        description: '绝对路径（含 /tmp /var/log 等）',
        example: '/var/log/auth.log  /home/user/.ssh/id_rsa',
      },
      {
        id: 'win-reg',
        name: 'Windows 注册表',
        pattern: '(?:HKLM|HKCU|HKCR|HKU|HKEY_LOCAL_MACHINE|HKEY_CURRENT_USER|HKEY_CLASSES_ROOT|HKEY_USERS)\\\\[^\\s\\r\\n"\']+',
        flags: 'gi',
        description: '注册表键路径',
        example: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
      },
      {
        id: 'guid',
        name: 'GUID/UUID',
        pattern: '\\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\b',
        flags: 'gi',
        description: '标准 GUID/UUID 格式',
        example: 'CLSID: {12345678-1234-1234-1234-1234567890AB}',
      },
      {
        id: 'datetime-iso',
        name: 'ISO 8601 时间',
        pattern: '\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:?\\d{2})?',
        flags: 'g',
        description: 'ISO 标准时间戳（含时区）',
        example: '2024-06-15T14:30:00.123Z  2024-06-15 22:30:00+08:00',
      },
      {
        id: 'win-event',
        name: 'Windows EventID',
        pattern: 'EventID[=:\\s]+(\\d{3,6})',
        flags: 'gi',
        description: '从日志提取事件 ID（捕获组1）',
        example: 'EventID: 4625  Logon Failure  /  EventID=4688 Process Create',
      },
      {
        id: 'email',
        name: '电子邮件',
        pattern: '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b',
        flags: 'gi',
        description: '标准邮箱格式',
        example: 'Contact: admin@example.com  or  user.name+tag@sub.domain.co.uk',
      },
      {
        id: 'phone-cn',
        name: '中国手机号',
        pattern: '(?<!\\d)1[3-9]\\d{9}(?!\\d)',
        flags: 'g',
        description: '中国大陆 11 位手机号（含前后边界）',
        example: 'Tel: 13800138000  SMS to 15912345678',
      },
    ],
  },
  {
    category: 'credential',
    label: '凭证密钥',
    icon: '🔑',
    items: [
      {
        id: 'aws-access-key',
        name: 'AWS Access Key',
        pattern: '(?:AKIA|ASIA|AIDA|AROA|AIPA|ANPA|ANVA|ASCA)[A-Z0-9]{16}',
        flags: 'g',
        description: 'AWS Access Key ID (20字符)',
        example: 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE',
      },
      {
        id: 'aws-secret-key',
        name: 'AWS Secret Key',
        pattern: '(?i)(?:aws(?:[_-]?secret(?:[_-]?access)?_?-?key|access[_-]?secret)[\'":=\\s]+)[\'"]?([A-Za-z0-9/+=]{40})',
        flags: 'gi',
        description: '可疑 AWS Secret Key（40字符，捕获组1）',
        example: 'aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      },
      {
        id: 'jwt-token',
        name: 'JWT Token',
        pattern: 'eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+',
        flags: 'g',
        description: '三段 Base64Url 结构的 JWT',
        example: 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      },
      {
        id: 'api-key',
        name: '通用 API Key',
        pattern: '(?i)(?:api[_-]?key|apikey|secret[_-]?key|client[_-]?secret)[\'":=\\s]+[\'"]?([A-Za-z0-9_\\-]{20,})[\'"]?',
        flags: 'gi',
        description: '常见 API Key 变量赋值（捕获组1）',
        example: 'API_KEY="sk_live_abcdefghijklmnopqrstuvwxyz0123456789"',
      },
      {
        id: 'pkcs8-key',
        name: 'PEM 私钥头',
        pattern: '-----BEGIN (?:RSA |EC |DSA |PGP |OPENSSH |)PRIVATE KEY-----',
        flags: 'g',
        description: '各类 PEM 格式私钥起始标记',
        example: '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQ...',
      },
      {
        id: 'password-assign',
        name: '密码赋值',
        pattern: '(?i)(?:pass(?:word)?|pwd)[\'":=\\s]+[\'"]([^\'"]{4,})[\'"]',
        flags: 'gi',
        description: '疑似硬编码密码（捕获组1）',
        example: 'password = "MyP@ssw0rd!2024"  db.pwd=\'secret_pass\'',
      },
      {
        id: 'github-token',
        name: 'GitHub Token',
        pattern: '(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9]{20,}',
        flags: 'g',
        description: 'GitHub 个人访问 Token 前缀',
        example: 'export GITHUB_TOKEN=ghp_16C7e42F292c6912E7710c838347Ae178B4a',
      },
      {
        id: 'slack-webhook',
        name: 'Slack Webhook',
        pattern: 'https://hooks\\.slack\\.com/services/T[A-Z0-9]{8,10}/B[A-Z0-9]{8,10}/[A-Za-z0-9]{24}',
        flags: 'gi',
        description: 'Slack Incoming Webhook URL',
        example: 'Webhook: https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX',
      },
    ],
  },
];

const FLAG_OPTIONS: { key: string; label: string; desc: string }[] = [
  { key: 'g', label: 'g', desc: '全局匹配 (global)' },
  { key: 'i', label: 'i', desc: '忽略大小写 (ignoreCase)' },
  { key: 'm', label: 'm', desc: '多行模式 (multiline)' },
  { key: 's', label: 's', desc: '点号匹配换行 (dotAll)' },
];

const SUB_TABS: { id: RegexPanelSubTab; label: string; icon: string }[] = [
  { id: 'custom', label: '自定义', icon: '✏️' },
  { id: 'library', label: '内置库', icon: '📚' },
  { id: 'explain', label: '语法说明', icon: '💡' },
];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function runRegex(pattern: string, flags: string, text: string): RegexExecState {
  const t0 = performance.now();
  if (!pattern) {
    return { valid: true, error: null, matches: [], totalMatches: 0, totalGroups: 0, execTimeMs: 0 };
  }
  let re: RegExp;
  try {
    re = new RegExp(pattern, flags);
  } catch (e) {
    return {
      valid: false,
      error: e instanceof Error ? e.message : String(e),
      matches: [],
      totalMatches: 0,
      totalGroups: 0,
      execTimeMs: null,
    };
  }
  const matches: RegexMatchResult[] = [];
  let totalGroups = 0;
  if (!flags.includes('g')) {
    const m = re.exec(text);
    if (m) {
      const groups: CaptureGroupMatch[] = [];
      for (let i = 1; i < m.length; i++) {
        if (m[i] !== undefined) {
          const gStart = text.indexOf(m[i], m.index);
          groups.push({
            index: i,
            name: (m.groups && Object.keys(m.groups).find((k) => m.groups![k] === m[i])) ?? null,
            value: m[i],
            start: gStart >= 0 ? gStart : m.index,
            end: gStart >= 0 ? gStart + m[i].length : m.index + m[i].length,
          });
        }
      }
      matches.push({
        fullMatch: m[0],
        index: matches.length,
        start: m.index,
        end: m.index + m[0].length,
        groups,
      });
      totalGroups += groups.length;
    }
  } else {
    let m: RegExpExecArray | null;
    const seen = new Set<number>();
    let guard = 0;
    while ((m = re.exec(text)) !== null && guard < 5000) {
      const cur = m;
      if (seen.has(cur.index)) break;
      seen.add(cur.index);
      guard++;
      const groups: CaptureGroupMatch[] = [];
      for (let i = 1; i < cur.length; i++) {
        if (cur[i] !== undefined) {
          groups.push({
            index: i,
            name: (cur.groups && Object.keys(cur.groups).find((k) => cur.groups![k] === cur[i])) ?? null,
            value: cur[i],
            start: cur.index + (cur[0].indexOf(cur[i]) >= 0 ? cur[0].indexOf(cur[i]) : 0),
            end: cur.index + (cur[0].indexOf(cur[i]) >= 0 ? cur[0].indexOf(cur[i]) : 0) + cur[i].length,
          });
        }
      }
      matches.push({
        fullMatch: cur[0],
        index: matches.length,
        start: cur.index,
        end: cur.index + cur[0].length,
        groups,
      });
      totalGroups += groups.length;
      if (cur[0].length === 0) re.lastIndex++;
    }
  }
  const dt = performance.now() - t0;
  return {
    valid: true,
    error: null,
    matches,
    totalMatches: matches.length,
    totalGroups,
    execTimeMs: Math.round(dt * 1000) / 1000,
  };
}

function buildHighlightedHtml(text: string, matches: RegexMatchResult[]): string {
  if (!text) return '';
  if (!matches.length) return escapeHtml(text);
  const colors = [
    'bg-yellow-200 dark:bg-yellow-500/40',
    'bg-green-200 dark:bg-green-500/40',
    'bg-blue-200 dark:bg-blue-500/40',
    'bg-pink-200 dark:bg-pink-500/40',
    'bg-purple-200 dark:bg-purple-500/40',
    'bg-orange-200 dark:bg-orange-500/40',
  ];
  type Segment = { start: number; end: number; matchIdx: number | null };
  const segments: Segment[] = [];
  let cursor = 0;
  const sorted = [...matches].sort((a, b) => a.start - b.start);
  for (const m of sorted) {
    if (m.start > cursor) segments.push({ start: cursor, end: m.start, matchIdx: null });
    segments.push({ start: m.start, end: m.end, matchIdx: m.index });
    cursor = Math.max(cursor, m.end);
  }
  if (cursor < text.length) segments.push({ start: cursor, end: text.length, matchIdx: null });
  return segments
    .map((seg) => {
      const raw = text.slice(seg.start, seg.end);
      const esc = escapeHtml(raw);
      if (seg.matchIdx === null) return esc;
      const c = colors[seg.matchIdx % colors.length];
      return `<span class="${c} rounded px-0.5" title="Match #${seg.matchIdx + 1}">${esc}</span>`;
    })
    .join('');
}

const RegexPanel: React.FC<Props> = ({ onAutoCopy }) => {
  const [subTab, setSubTab] = usePersistentState<RegexPanelSubTab>('regex.subTab', 'custom');
  const [pattern, setPattern] = usePersistentState<string>('regex.pattern', '');
  const [flags, setFlags] = usePersistentState<string>('regex.flags', 'g');
  const [testText, setTestText] = usePersistentState<string>('regex.testText', '');
  const [libraryCategory, setLibraryCategory] = usePersistentState<RegexLibraryCategory>('regex.libraryCategory', 'network');
  const [selectedPreset, setSelectedPreset] = useState<RegexPresetItem | null>(null);
  const [debounced, setDebounced] = useState<{ p: string; f: string; t: string }>({ p: '', f: 'g', t: '' });
  const [activeMatchIdx, setActiveMatchIdx] = useState<number | null>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  const toggleFlag = (f: string) => {
    setFlags((prev) => (prev.includes(f) ? prev.replace(f, '') : prev + f));
  };

  // 防抖 120ms
  useEffect(() => {
    const t = setTimeout(() => setDebounced({ p: pattern, f: flags, t: testText }), 120);
    return () => clearTimeout(t);
  }, [pattern, flags, testText]);

  const execState = useMemo(
    () => runRegex(debounced.p, debounced.f, debounced.t),
    [debounced.p, debounced.f, debounced.t],
  );

  const highlightedHtml = useMemo(
    () => buildHighlightedHtml(testText, execState.matches),
    [testText, execState.matches],
  );

  const applyPreset = useCallback((item: RegexPresetItem) => {
    setPattern(item.pattern);
    if (item.flags) setFlags(item.flags);
    if (item.example) setTestText(item.example);
    setSelectedPreset(item);
    setSubTab('custom');
    setActiveMatchIdx(null);
  }, []);

  const activeCategory = REGEX_LIBRARY.find((g) => g.category === libraryCategory)!;

  const copyPattern = () => {
    if (!pattern) return;
    const full = `/${pattern}/${flags}`;
    navigator.clipboard.writeText(full);
    onAutoCopy(full);
  };

  const copyMatch = (idx: number) => {
    const m = execState.matches[idx];
    if (!m) return;
    navigator.clipboard.writeText(m.fullMatch);
    onAutoCopy(m.fullMatch);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sub tabs */}
      <div className="flex items-center gap-0.5 px-3 py-2 border-b border-slate-200 dark:border-slate-700 shrink-0 overflow-x-auto">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => { setSubTab(t.id); setActiveMatchIdx(null); }}
            className={`flex items-center gap-1 text-2xs px-2.5 py-1 rounded-md whitespace-nowrap transition-colors ${
              subTab === t.id
                ? 'bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 font-medium'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
        <div className="flex-1" />
        <div className="text-2xs text-slate-400 dark:text-slate-500 px-2">
          {execState.totalMatches > 0 ? (
            <span className="text-green-600 dark:text-green-400">
              ● {execState.totalMatches} 匹配 / {execState.totalGroups} 组
            </span>
          ) : execState.valid ? (
            <span>○ 无匹配</span>
          ) : (
            <span className="text-red-600 dark:text-red-400">✕ 语法错误</span>
          )}
          {execState.execTimeMs != null && (
            <span className="ml-2 text-slate-400">{execState.execTimeMs}ms</span>
          )}
        </div>
      </div>

      {/* Library browser */}
      {subTab === 'library' && (
        <div className="flex flex-col border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="flex items-center gap-1 px-3 pt-2 pb-1.5 overflow-x-auto">
            {REGEX_LIBRARY.map((g) => (
              <button
                key={g.category}
                onClick={() => { setLibraryCategory(g.category); setSelectedPreset(null); }}
                className={`flex items-center gap-1 text-2xs px-2.5 py-1 rounded-md whitespace-nowrap transition-colors ${
                  libraryCategory === g.category
                    ? 'bg-primary-500 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span>{g.icon}</span>{g.label}
              </button>
            ))}
          </div>
          <div className="px-3 pb-2 grid grid-cols-2 gap-1.5 max-h-[150px] overflow-y-auto">
            {activeCategory.items.map((item) => (
              <button
                key={item.id}
                onClick={() => applyPreset(item)}
                title={item.description}
                className={`text-left text-2xs px-2.5 py-2 rounded-md border transition-all ${
                  selectedPreset?.id === item.id
                    ? 'border-primary-400 dark:border-primary-500 bg-primary-50 dark:bg-primary-500/10'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-primary-300 dark:hover:border-primary-600'
                }`}
              >
                <div className="font-medium text-slate-700 dark:text-slate-200">{item.name}</div>
                <div className="text-slate-500 dark:text-slate-400 truncate mt-0.5 font-mono">{item.pattern}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Syntax explain */}
      {subTab === 'explain' && (
        <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 shrink-0 max-h-[160px] overflow-y-auto">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-2xs">
            {[
              ['.', '任意字符 (不含换行)'],
              ['\\d', '数字 [0-9]'],
              ['\\w', '字母数字下划线'],
              ['\\s', '空白字符'],
              ['^', '行/字符串首'],
              ['$', '行/字符串尾'],
              ['*', '0 次或多次'],
              ['+', '1 次或多次'],
              ['?', '0 或 1 次'],
              ['{n,m}', 'n 到 m 次'],
              ['[abc]', '字符集'],
              ['[^abc]', '排除字符集'],
              ['()', '捕获组'],
              ['(?:)', '非捕获组'],
              ['(?<n>)', '命名捕获组'],
              ['a|b', '或运算'],
              ['(?=)', '正向先行断言'],
              ['(?!)', '负向先行断言'],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-2 py-0.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <code className="font-mono text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-500/10 px-1.5 py-0.5 rounded whitespace-nowrap min-w-[60px] text-center">{k}</code>
                <span className="text-slate-600 dark:text-slate-400">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pattern + Flags row */}
      <div className="px-3 pt-2 pb-1.5 border-b border-slate-200 dark:border-slate-700 shrink-0 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-2xs font-mono text-slate-400 dark:text-slate-500 shrink-0">/</span>
          <input
            value={pattern}
            onChange={(e) => { setPattern(e.target.value); setSelectedPreset(null); setActiveMatchIdx(null); }}
            placeholder="在此输入正则表达式..."
            spellCheck={false}
            className="flex-1 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-2 py-1.5 text-slate-700 dark:text-slate-300 placeholder-slate-400 font-mono focus:ring-1 focus:ring-primary-500 outline-none"
          />
          <span className="text-2xs font-mono text-slate-400 dark:text-slate-500 shrink-0">/</span>
          <input
            value={flags}
            onChange={(e) => setFlags(e.target.value)}
            spellCheck={false}
            className="w-14 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-2 py-1.5 text-slate-700 dark:text-slate-300 font-mono text-center focus:ring-1 focus:ring-primary-500 outline-none"
          />
          {pattern && (
            <button
              onClick={copyPattern}
              title="复制正则 /pattern/flags"
              className="text-2xs px-2 py-1.5 bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-500/20 rounded-md transition-colors whitespace-nowrap"
            >
              复制
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {FLAG_OPTIONS.map((f) => (
            <button
              key={f.key}
              onClick={() => toggleFlag(f.key)}
              title={f.desc}
              className={`text-2xs px-2 py-0.5 rounded border transition-colors font-mono ${
                flags.includes(f.key)
                  ? 'bg-primary-500 text-white border-primary-500'
                  : 'bg-transparent text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              {f.label}
            </button>
          ))}
          {selectedPreset && (
            <span className="ml-auto text-2xs text-slate-500 dark:text-slate-400 truncate max-w-[220px]">
              📌 {selectedPreset.name} — {selectedPreset.description}
            </span>
          )}
        </div>
      </div>

      {/* Error banner */}
      {!execState.valid && execState.error && (
        <div className="mx-3 mb-2 text-2xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 rounded-md px-3 py-1.5 shrink-0 font-mono break-all">
          ⚠ {execState.error}
        </div>
      )}

      {/* Test text input + highlight */}
      <div className="flex-1 flex flex-col min-h-0 mx-3 gap-2 py-2">
        <div className="flex-1 flex flex-col min-h-0">
          <div className="text-2xs text-slate-400 dark:text-slate-500 mb-0.5 shrink-0 flex items-center gap-2">
            <span>测试文本</span>
            {testText && (
              <button
                onClick={() => setTestText('')}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-2xs"
              >
                清空
              </button>
            )}
          </div>
          <div className="relative flex-1 min-h-[60px]">
            <textarea
              value={testText}
              onChange={(e) => { setTestText(e.target.value); setActiveMatchIdx(null); }}
              placeholder="粘贴待匹配文本（实时匹配）..."
              spellCheck={false}
              className="absolute inset-0 w-full h-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 placeholder-slate-400 resize-none font-mono focus:ring-1 focus:ring-primary-500 outline-none text-transparent caret-slate-700 dark:caret-slate-300 selection:bg-primary-200/50 dark:selection:bg-primary-500/40 z-10 whitespace-pre-wrap break-words"
            />
            <div
              ref={highlightRef}
              className="absolute inset-0 w-full h-full text-xs rounded-lg border border-transparent px-3 py-2 font-mono whitespace-pre-wrap break-words pointer-events-none overflow-hidden text-slate-700 dark:text-slate-300"
              dangerouslySetInnerHTML={{ __html: highlightedHtml || (testText ? escapeHtml(testText) : '') }}
            />
          </div>
        </div>

        {/* Matches + groups output */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="text-2xs text-slate-400 dark:text-slate-500 mb-0.5 shrink-0 flex items-center gap-2">
            <span>匹配结果</span>
            {execState.matches.length > 0 && (
              <span className="text-slate-500 dark:text-slate-400">
                (点击复制)
              </span>
            )}
          </div>
          <div className="flex-1 min-h-[60px] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-xs">
            {!execState.valid && execState.error && (
              <div className="text-slate-400 dark:text-slate-500 py-2 px-1">请先修正上方正则语法错误</div>
            )}
            {execState.valid && execState.matches.length === 0 && testText && (
              <div className="text-slate-400 dark:text-slate-500 py-2 px-1">无匹配结果，尝试调整正则或 flags</div>
            )}
            {execState.valid && !testText && (
              <div className="text-slate-400 dark:text-slate-500 py-2 px-1">请在上方输入测试文本</div>
            )}
            {execState.matches.map((m) => (
              <div
                key={m.index}
                onClick={() => copyMatch(m.index)}
                onMouseEnter={() => setActiveMatchIdx(m.index)}
                onMouseLeave={() => setActiveMatchIdx(null)}
                className={`group cursor-pointer rounded-md px-2 py-1.5 my-0.5 border transition-colors ${
                  activeMatchIdx === m.index
                    ? 'border-primary-400 dark:border-primary-500 bg-primary-50 dark:bg-primary-500/10'
                    : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-700/50'
                }`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-400 dark:text-slate-500 text-2xs shrink-0 font-mono">#{m.index + 1}</span>
                  <span className="text-slate-500 dark:text-slate-400 text-2xs shrink-0">@{m.start}-{m.end}</span>
                  <code className="font-mono text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-700/60 px-1.5 py-0.5 rounded break-all text-primary-700 dark:text-primary-300">
                    {m.fullMatch.length > 120 ? m.fullMatch.slice(0, 120) + '…' : m.fullMatch}
                  </code>
                  <span className="ml-auto text-2xs text-slate-400 dark:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    📋 点击复制
                  </span>
                </div>
                {m.groups.length > 0 && (
                  <div className="mt-1 ml-6 space-y-0.5 border-l-2 border-slate-200 dark:border-slate-600 pl-2">
                    {m.groups.map((g) => (
                      <div key={g.index} className="flex items-center gap-2 flex-wrap text-2xs">
                        <span className="font-mono text-purple-600 dark:text-purple-400 shrink-0">
                          ${g.index}{g.name ? ` (<${g.name}>)` : ''}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400 shrink-0">@{g.start}</span>
                        <code className="font-mono bg-purple-50 dark:bg-purple-500/10 text-purple-800 dark:text-purple-200 px-1.5 py-0.5 rounded break-all">
                          {g.value.length > 120 ? g.value.slice(0, 120) + '…' : g.value}
                        </code>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegexPanel;
