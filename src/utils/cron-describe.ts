// ============================================================
// Cron 表达式中文可读描述模块 — 实现
// ============================================================
import type { ToolResult } from '../types';

function success<T>(data: T, metadata?: Record<string, string>): ToolResult<T> {
  return { success: true, data, error: null, metadata: metadata ?? null };
}

function fail(error: string): ToolResult<never> {
  return { success: false, data: undefined as never, error, metadata: null };
}

// ================================================================
// 基础类型
// ================================================================

export interface CronField {
  name: string;
  raw: string;
  description: string;
}

export interface CronDescribeResult {
  expression: string;
  fields: CronField[];
  description: string;
  shortDescription: string;
  nextRuns: string[];
  isValid: boolean;
  errorDetail?: string;
}

type CronPart = 'second' | 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek' | 'year';

const WEEKDAYS_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const MONTHS_CN = ['', '一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

const FIELD_RANGES: Record<CronPart, [number, number]> = {
  second: [0, 59],
  minute: [0, 59],
  hour: [0, 23],
  dayOfMonth: [1, 31],
  month: [1, 12],
  dayOfWeek: [0, 7],
  year: [1970, 2099],
};

const FIELD_NAMES: Record<CronPart, string> = {
  second: '秒',
  minute: '分',
  hour: '时',
  dayOfMonth: '日',
  month: '月',
  dayOfWeek: '周',
  year: '年',
};

// ================================================================
// 解析 Cron 表达式
// ================================================================

export function cronDescribe(expression: string): ToolResult<CronDescribeResult> {
  if (!expression?.trim()) return fail('EMPTY_INPUT');

  const trimmed = expression.trim();
  const parts = trimmed.split(/\s+/);

  let hasSecond = false;
  let hasYear = false;

  if (parts.length === 6) {
    hasSecond = true;
  } else if (parts.length === 7) {
    hasSecond = true;
    hasYear = true;
  } else if (parts.length === 5) {
    // 标准 5 段格式
  } else {
    return fail('INVALID_FIELD_COUNT: Cron 表达式应为 5/6/7 个字段');
  }

  try {
    let idx = 0;
    const fields: Partial<Record<CronPart, string>> = {};

    if (hasSecond) fields.second = parts[idx++];
    fields.minute = parts[idx++];
    fields.hour = parts[idx++];
    fields.dayOfMonth = parts[idx++];
    fields.month = parts[idx++];
    fields.dayOfWeek = parts[idx++];
    if (hasYear) fields.year = parts[idx++];

    if (!hasSecond) fields.second = '0';

    const normalized: Record<CronPart, string> = {
      second: fields.second!,
      minute: fields.minute,
      hour: fields.hour,
      dayOfMonth: fields.dayOfMonth,
      month: fields.month,
      dayOfWeek: fields.dayOfWeek,
      year: fields.year ?? '*',
    };

    const describedFields: CronField[] = [];
    const fieldDescriptions: string[] = [];

    for (const key of Object.keys(normalized) as CronPart[]) {
      const raw = normalized[key];
      validateField(raw, key);
      const desc = describeField(raw, key);
      describedFields.push({ name: FIELD_NAMES[key], raw, description: desc });
      if (desc && desc !== '每' + FIELD_NAMES[key]) {
        fieldDescriptions.push(desc);
      }
    }

    const description = buildFullDescription(normalized);
    const shortDescription = buildShortDescription(normalized);
    const nextRuns = calculateNextRuns(normalized, 5);

    return success({
      expression: trimmed,
      fields: describedFields,
      description,
      shortDescription,
      nextRuns,
      isValid: true,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail(msg);
  }
}

// ================================================================
// 验证单个字段
// ================================================================

function validateField(raw: string, part: CronPart): void {
  if (!raw) throw new Error(`EMPTY_FIELD: ${FIELD_NAMES[part]}字段为空`);

  const [min, max] = FIELD_RANGES[part];

  for (const segment of raw.split(',')) {
    if (!segment) throw new Error(`INVALID_FIELD: ${FIELD_NAMES[part]}字段格式错误`);

    if (segment.includes('/')) {
      const [range, stepStr] = segment.split('/');
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) throw new Error(`INVALID_STEP: ${FIELD_NAMES[part]}步长无效`);
      if (range !== '*' && range !== '?') {
        validateRangeOrValue(range, min, max, part);
      }
    } else if (segment === '*' || segment === '?') {
      // 通配符，无需额外校验
    } else if (segment === 'L') {
      if (part !== 'dayOfMonth' && part !== 'dayOfWeek') {
        throw new Error(`INVALID_L: L 仅用于日和周字段`);
      }
    } else if (segment === 'W') {
      if (part !== 'dayOfMonth') {
        throw new Error(`INVALID_W: W 仅用于日字段`);
      }
    } else if (segment.endsWith('L') && part === 'dayOfWeek') {
      const num = parseInt(segment.slice(0, -1), 10);
      if (isNaN(num) || num < min || num > max) {
        throw new Error(`INVALID_L: ${FIELD_NAMES[part]}字段值越界`);
      }
    } else if (segment.includes('#') && part === 'dayOfWeek') {
      const [dayStr, ordStr] = segment.split('#');
      const day = parseInt(dayStr, 10);
      const ord = parseInt(ordStr, 10);
      if (isNaN(day) || day < min || day > max) {
        throw new Error(`INVALID_HASH: 周字段值越界`);
      }
      if (isNaN(ord) || ord < 1 || ord > 5) {
        throw new Error(`INVALID_HASH: 第N个星期几的序号应在1-5之间`);
      }
    } else {
      validateRangeOrValue(segment, min, max, part);
    }
  }
}

function validateRangeOrValue(segment: string, min: number, max: number, part: CronPart): void {
  if (segment.includes('-')) {
    const [aStr, bStr] = segment.split('-');
    const a = parseInt(aStr, 10);
    const b = parseInt(bStr, 10);
    if (isNaN(a) || isNaN(b) || a < min || b > max || a > b) {
      throw new Error(`INVALID_RANGE: ${FIELD_NAMES[part]}范围无效`);
    }
  } else {
    const n = parseInt(segment, 10);
    if (isNaN(n) || n < min || n > max) {
      throw new Error(`INVALID_VALUE: ${FIELD_NAMES[part]}字段值越界，应在${min}-${max}之间`);
    }
  }
}

// ================================================================
// 单个字段描述
// ================================================================

function describeField(raw: string, part: CronPart): string {
  const name = FIELD_NAMES[part];

  if (raw === '*') return `每${name}`;
  if (raw === '?') return `每${name}（不指定）`;

  const segments = raw.split(',').map(s => s.trim()).filter(Boolean);
  const descs = segments.map(s => describeSegment(s, part));
  return descs.join('，');
}

function describeSegment(segment: string, part: CronPart): string {
  const name = FIELD_NAMES[part];

  if (segment.includes('/')) {
    const [range, stepStr] = segment.split('/');
    const step = parseInt(stepStr, 10);
    if (range === '*' || range === '?') {
      return `每${step}${name}`;
    }
    if (range.includes('-')) {
      const [a, b] = range.split('-');
      return `${formatValue(parseInt(a, 10), part)}至${formatValue(parseInt(b, 10), part)}之间，每${step}${name}一次`;
    }
    return `从${formatValue(parseInt(range, 10), part)}开始，每${step}${name}一次`;
  }

  if (segment === 'L' && part === 'dayOfMonth') return '每月最后一天';
  if (segment === 'L' && part === 'dayOfWeek') return '每周六';
  if (segment === 'W' && part === 'dayOfMonth') return '最近的工作日';

  if (segment.endsWith('L') && part === 'dayOfWeek') {
    const num = parseInt(segment.slice(0, -1), 10);
    return `每月最后一个${weekdayName(num)}`;
  }

  if (segment.includes('#') && part === 'dayOfWeek') {
    const [dayStr, ordStr] = segment.split('#');
    return `每月第${parseInt(ordStr, 10)}个${weekdayName(parseInt(dayStr, 10))}`;
  }

  if (segment.includes('-')) {
    const [a, b] = segment.split('-');
    return `${formatValue(parseInt(a, 10), part)}至${formatValue(parseInt(b, 10), part)}`;
  }

  const n = parseInt(segment, 10);
  return formatValue(n, part);
}

function formatValue(n: number, part: CronPart): string {
  switch (part) {
    case 'dayOfWeek':
      return weekdayName(n);
    case 'month':
      return MONTHS_CN[n] || String(n);
    case 'dayOfMonth':
      return `${n}日`;
    case 'hour':
      return `${n}点`;
    case 'minute':
      return `${n}分`;
    case 'second':
      return `${n}秒`;
    case 'year':
      return `${n}年`;
    default:
      return String(n);
  }
}

function weekdayName(n: number): string {
  if (n === 0 || n === 7) return WEEKDAYS_CN[0];
  return WEEKDAYS_CN[n] || String(n);
}

// ================================================================
// 构建完整描述
// ================================================================

function buildFullDescription(f: Record<CronPart, string>): string {
  const parts: string[] = [];

  const timePart = describeTime(f.second, f.minute, f.hour);
  if (timePart) parts.push(timePart);

  const datePart = describeDate(f.dayOfMonth, f.month, f.dayOfWeek, f.year);
  if (datePart) parts.push(datePart);

  if (parts.length === 0) return '每秒执行';

  return parts.join('，') + ' 执行';
}

function buildShortDescription(f: Record<CronPart, string>): string {
  const second = f.second;
  const minute = f.minute;
  const hour = f.hour;
  const dayOfMonth = f.dayOfMonth;
  const month = f.month;
  const dayOfWeek = f.dayOfWeek;

  if (minute === '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    if (second === '*' || second === '0') return '每分钟执行';
    if (second.includes('/')) {
      const [, step] = second.split('/');
      return `每${step}秒执行`;
    }
    return `每分钟的第${second}秒执行`;
  }

  if (second === '0' && !minute.includes('/') && !minute.includes(',') && !minute.includes('-') && !minute.includes('*') &&
      !hour.includes('/') && !hour.includes(',') && !hour.includes('-') && !hour.includes('*')) {
    const h = parseInt(hour, 10);
    const m = parseInt(minute, 10);
    if (!isNaN(h) && !isNaN(m)) {
      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      if (dayOfWeek !== '*' && dayOfWeek !== '?') {
        return `每周${describeDayOfWeekShort(dayOfWeek)} ${timeStr}执行`;
      }
      if (dayOfMonth !== '*' && dayOfMonth !== '?') {
        return `每月${dayOfMonth}日 ${timeStr}执行`;
      }
      return `每天 ${timeStr}执行`;
    }
  }

  return buildFullDescription(f);
}

function describeDayOfWeekShort(raw: string): string {
  const segments = raw.split(',');
  return segments.map(s => {
    if (s.includes('-')) {
      const [a, b] = s.split('-');
      return `${weekdayShort(parseInt(a, 10))}到${weekdayShort(parseInt(b, 10))}`;
    }
    return weekdayShort(parseInt(s, 10));
  }).join('、');
}

function weekdayShort(n: number): string {
  if (n === 0 || n === 7) return '日';
  return ['一', '二', '三', '四', '五', '六'][n - 1] || String(n);
}

function describeTime(second: string, minute: string, hour: string): string {
  const parts: string[] = [];

  if (second !== '*' && second !== '0') {
    parts.push(describeField(second, 'second'));
  }
  if (minute !== '*') {
    parts.push(describeField(minute, 'minute'));
  } else if (second === '*') {
    parts.push('每分钟');
  }
  if (hour !== '*') {
    parts.push(describeField(hour, 'hour'));
  } else if (minute === '*' && second !== '*') {
    // 秒级精度已描述，小时级别无需额外文字
  } else if (minute === '*') {
    parts.push('每小时');
  }

  return parts.join('，');
}

function describeDate(dayOfMonth: string, month: string, dayOfWeek: string, year: string): string {
  const parts: string[] = [];

  if (year !== '*' && year !== '?') {
    parts.push(describeField(year, 'year'));
  }
  if (month !== '*') {
    parts.push(describeField(month, 'month'));
  }
  if (dayOfWeek !== '*' && dayOfWeek !== '?') {
    parts.push(describeField(dayOfWeek, 'dayOfWeek'));
  }
  if (dayOfMonth !== '*' && dayOfMonth !== '?') {
    if (dayOfWeek !== '*' && dayOfWeek !== '?') {
      parts.push('以及' + describeField(dayOfMonth, 'dayOfMonth'));
    } else {
      parts.push(describeField(dayOfMonth, 'dayOfMonth'));
    }
  }

  return parts.join('，');
}

// ================================================================
// 计算接下来的 N 次执行时间
// ================================================================

function calculateNextRuns(f: Record<CronPart, string>, count: number): string[] {
  const results: string[] = [];
  let now = new Date();
  now.setMilliseconds(0);

  const maxIterations = 366 * 24 * 60 * 60;
  let iterations = 0;

  while (results.length < count && iterations < maxIterations) {
    iterations++;
    now = new Date(now.getTime() + 1000);

    if (matchesCron(now, f)) {
      results.push(formatDateTime(now));
    }
  }

  return results;
}

function matchesCron(d: Date, f: Record<CronPart, string>): boolean {
  return (
    matchesField(d.getSeconds(), f.second, 'second') &&
    matchesField(d.getMinutes(), f.minute, 'minute') &&
    matchesField(d.getHours(), f.hour, 'hour') &&
    matchesField(d.getDate(), f.dayOfMonth, 'dayOfMonth') &&
    matchesField(d.getMonth() + 1, f.month, 'month') &&
    matchesField(d.getDay(), f.dayOfWeek, 'dayOfWeek')
  );
}

function matchesField(value: number, raw: string, part: CronPart): boolean {
  if (raw === '*' || raw === '?') return true;

  const segments = raw.split(',');
  for (const seg of segments) {
    if (matchSegment(value, seg, part)) return true;
  }
  return false;
}

function matchSegment(value: number, seg: string, part: CronPart): boolean {
  if (seg.includes('/')) {
    const [range, stepStr] = seg.split('/');
    const step = parseInt(stepStr, 10);
    let start = FIELD_RANGES[part][0];
    let end = FIELD_RANGES[part][1];

    if (range !== '*' && range !== '?') {
      if (range.includes('-')) {
        const [a, b] = range.split('-');
        start = parseInt(a, 10);
        end = parseInt(b, 10);
      } else {
        start = parseInt(range, 10);
        end = FIELD_RANGES[part][1];
      }
    }

    if (value < start || value > end) return false;
    return (value - start) % step === 0;
  }

  if (seg.includes('-')) {
    const [a, b] = seg.split('-');
    const lo = parseInt(a, 10);
    const hi = parseInt(b, 10);
    if (part === 'dayOfWeek') {
      const v = value === 0 ? 7 : value;
      const l = lo === 0 ? 7 : lo;
      const h = hi === 0 ? 7 : hi;
      return v >= l && v <= h;
    }
    return value >= lo && value <= hi;
  }

  if (part === 'dayOfWeek' && parseInt(seg, 10) === 7) return value === 0;

  return value === parseInt(seg, 10);
}

function formatDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ================================================================
// 中文语义 → Cron 表达式（辅助）
// ================================================================

const PRESET_CRON: { keyword: string; cron: string; desc: string }[] = [
  { keyword: '每秒', cron: '* * * * * ?', desc: '每秒执行' },
  { keyword: '每分钟', cron: '0 * * * * ?', desc: '每分钟第0秒执行' },
  { keyword: '每小时', cron: '0 0 * * * ?', desc: '每小时第0分0秒执行' },
  { keyword: '每天', cron: '0 0 0 * * ?', desc: '每天00:00:00执行' },
  { keyword: '每天零点', cron: '0 0 0 * * ?', desc: '每天00:00:00执行' },
  { keyword: '每天凌晨', cron: '0 0 0 * * ?', desc: '每天00:00:00执行' },
  { keyword: '每天早上8点', cron: '0 0 8 * * ?', desc: '每天08:00:00执行' },
  { keyword: '每天上午9点', cron: '0 0 9 * * ?', desc: '每天09:00:00执行' },
  { keyword: '每天中午12点', cron: '0 0 12 * * ?', desc: '每天12:00:00执行' },
  { keyword: '每天晚上6点', cron: '0 0 18 * * ?', desc: '每天18:00:00执行' },
  { keyword: '每周一', cron: '0 0 0 ? * MON', desc: '每周一00:00:00执行' },
  { keyword: '每周一早上9点', cron: '0 0 9 ? * MON', desc: '每周一09:00:00执行' },
  { keyword: '每月1号', cron: '0 0 0 1 * ?', desc: '每月1日00:00:00执行' },
  { keyword: '每月1日', cron: '0 0 0 1 * ?', desc: '每月1日00:00:00执行' },
  { keyword: '每月最后一天', cron: '0 0 0 L * ?', desc: '每月最后一天00:00:00执行' },
];

export function naturalToCron(text: string): ToolResult<{ cron: string; matched: string; description: string }[]> {
  if (!text?.trim()) return fail('EMPTY_INPUT');

  const t = text.trim();
  const results: { cron: string; matched: string; description: string }[] = [];

  for (const p of PRESET_CRON) {
    if (t.includes(p.keyword) || p.keyword.includes(t)) {
      results.push({ cron: p.cron, matched: p.keyword, description: p.desc });
    }
  }

  if (results.length === 0) {
    const timeMatch = t.match(/(\d{1,2})[点:：](\d{1,2})/);
    if (timeMatch) {
      const h = parseInt(timeMatch[1], 10);
      const m = parseInt(timeMatch[2], 10);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        results.push({
          cron: `0 ${m} ${h} * * ?`,
          matched: `每天${h}点${m}分`,
          description: `每天 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00 执行`,
        });
      }
    }

    const hourMatch = t.match(/(\d{1,2})点/);
    if (hourMatch && !timeMatch) {
      const h = parseInt(hourMatch[1], 10);
      if (h >= 0 && h <= 23) {
        results.push({
          cron: `0 0 ${h} * * ?`,
          matched: `每天${h}点`,
          description: `每天 ${String(h).padStart(2, '0')}:00:00 执行`,
        });
      }
    }
  }

  if (results.length === 0) return fail('NO_MATCH: 未匹配到常用时间语义');

  return success(results);
}
