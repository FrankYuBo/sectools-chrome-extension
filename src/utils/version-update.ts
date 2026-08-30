// ============================================================
// 版本更新模块 — 实现
// 由 .spec/version-update.spec.yaml 驱动
// 方案 C：fetch GitHub Releases latest 对比 tag_name（不依赖 Chrome Web Store）
// ============================================================

// 忽略级别
export type DismissLevel = 'once' | 'forever';

// ================================================================
// 存储键
// ================================================================

const STORAGE_KEY_DISMISSED_VERSION = 'dismissedVersion';
const STORAGE_KEY_DISMISSED_TIME = 'dismissedTime';
const STORAGE_KEY_LAST_CHECK_TIME = 'lastUpdateCheckTime';
const STORAGE_KEY_LAST_DISMISS_TYPE = 'lastDismissType'; // 'once' | 'forever'
const STORAGE_KEY_LAST_CHECK_RESULT = 'lastUpdateCheckResult'; // 冷却期内复用的结果缓存

// ================================================================
// GitHub 仓库配置（方案 C：自托管对比检查）
// ================================================================

const GITHUB_OWNER = 'FrankYuBo';
const GITHUB_REPO = 'sectools-chrome-extension';
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
export const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases/latest`;
const GITHUB_API_LATEST_RELEASE =
  `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

// ================================================================
// 常量
// ================================================================

// 冷却时间：1 小时（毫秒）
const CHECK_COOLDOWN_MS = 60 * 60 * 1000;

// fetch 超时：3 秒（避免 GitHub API 不可达时长时间挂起）
const FETCH_TIMEOUT_MS = 3000;

// ================================================================
// 版本检查
// ================================================================

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  /** GitHub Releases 跳转地址（有更新时） */
  releaseUrl?: string;
}

/**
 * 解析 semver 为数字三元组（忽略非数字后缀）。
 * 例：'v0.2.0' → [0,2,0]；'1.2.3-beta' → [1,2,3]
 */
function parseSemver(v: string): [number, number, number] {
  const cleaned = v.trim().replace(/^v/i, '').split('-')[0];
  const parts = cleaned.split('.').map((p) => parseInt(p, 10) || 0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/** 比较 semver：latest > current → true（有更新） */
function isNewer(latest: string, current: string): boolean {
  const [a1, a2, a3] = parseSemver(latest);
  const [b1, b2, b3] = parseSemver(current);
  if (a1 !== b1) return a1 > b1;
  if (a2 !== b2) return a2 > b2;
  return a3 > b3;
}

export async function checkForUpdate(options?: { force?: boolean }): Promise<UpdateCheckResult> {
  const currentVersion = getCurrentVersion();

  try {
    // 检查冷却时间：手动检查（force）时跳过冷却，直接发请求
    if (!options?.force) {
      const lastCheck = await getLastCheckTime();
      if (lastCheck && Date.now() - lastCheck < CHECK_COOLDOWN_MS) {
      const cached = await getCachedResult();
      if (!cached) return { hasUpdate: false, currentVersion };
      if (cached.hasUpdate && cached.latestVersion) {
        const dismissedVersion = await getDismissedVersion();
        const dismissType = await getLastDismissType();
        if (dismissedVersion === cached.latestVersion && dismissType === 'forever') {
          return { hasUpdate: false, currentVersion };
        }
      }
      return { ...cached, currentVersion };
    }
    } // end if (!options?.force)

    // 方案 C：fetch GitHub Releases latest
    // 带 3s 超时：GitHub API 不可达 / 网络黑洞时快速失败，不再长时间挂起
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await fetch(GITHUB_API_LATEST_RELEASE, {
        method: 'GET',
        headers: { Accept: 'application/vnd.github+json' },
        signal: controller.signal,
      });
    } catch (err) {
      // 超时 / 网络错误：同样写入冷却，避免冷却期内反复请求不可达的 API
      await updateLastCheckTime();
      throw err;
    } finally {
      clearTimeout(timer);
    }

    // 写入冷却与结果缓存（即使 403 rate-limit 也写入，避免打爆 GitHub API）
    await updateLastCheckTime();
    const result = await buildResultFromResponse(resp, currentVersion);
    await cacheResult(result);
    return result;
  } catch {
    // 离线 / 超时 abort / fetch 抛错，静默处理
    return { hasUpdate: false, currentVersion };
  }
}

/** 解析 GitHub API 响应为 UpdateCheckResult（含忽略逻辑） */
async function buildResultFromResponse(
  resp: Response,
  currentVersion: string,
): Promise<UpdateCheckResult> {
  if (!resp.ok) {
    // 403 rate-limit、404 no release、离线：静默不报错
    return { hasUpdate: false, currentVersion };
  }

  const release = (await resp.json()) as { tag_name?: string; html_url?: string };
  const rawTag = release.tag_name?.trim() || '';
  if (!rawTag) {
    return { hasUpdate: false, currentVersion };
  }

  const latestVersion = rawTag.replace(/^v/i, ''); // 'v0.2.1' → '0.2.1'
  const releaseUrl = release.html_url || GITHUB_RELEASES_URL;

  if (!isNewer(latestVersion, currentVersion)) {
    return { hasUpdate: false, currentVersion, latestVersion, releaseUrl };
  }

  // —— 有新版本 ——

  // 检查用户是否忽略了这个版本
  const dismissedVersion = await getDismissedVersion();
  const dismissType = await getLastDismissType();

  if (dismissType === 'forever' && dismissedVersion === latestVersion) {
    return { hasUpdate: false, currentVersion, latestVersion, releaseUrl };
  }

  if (dismissType === 'once' && dismissedVersion === latestVersion) {
    await clearDismissed();
    return { hasUpdate: true, currentVersion, latestVersion, releaseUrl };
  }

  return { hasUpdate: true, currentVersion, latestVersion, releaseUrl };
}

export function getCurrentVersion(): string {
  return chrome.runtime.getManifest().version;
}

// ================================================================
// Badge 管理
// ================================================================

export function showUpdateBadge(): void {
  if (chrome.action) {
    chrome.action.setBadgeText({ text: 'NEW' });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
  }
}

export function clearUpdateBadge(): void {
  if (chrome.action) {
    chrome.action.setBadgeText({ text: '' });
  }
}

// ================================================================
// 忽略/关闭更新通知
// ================================================================

export async function dismissUpdate(
  version: string,
  type: DismissLevel = 'once',
): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEY_DISMISSED_VERSION]: version,
    [STORAGE_KEY_DISMISSED_TIME]: Date.now(),
    [STORAGE_KEY_LAST_DISMISS_TYPE]: type,
  });
  clearUpdateBadge();
}

export async function shouldShowUpdateBanner(
  latestVersion: string,
): Promise<boolean> {
  const dismissedVersion = await getDismissedVersion();
  const dismissType = await getLastDismissType();

  if (dismissedVersion !== latestVersion) return true;
  if (dismissType === 'forever') return false;
  if (dismissType === 'once') {
    // once：下次独立打开时清除记录
    await clearDismissed();
    return true;
  }
  return true;
}

// ================================================================
// Storage Helpers
// ================================================================

async function getDismissedVersion(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY_DISMISSED_VERSION);
  return result[STORAGE_KEY_DISMISSED_VERSION] ?? null;
}

async function getLastDismissType(): Promise<'once' | 'forever' | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY_LAST_DISMISS_TYPE);
  return result[STORAGE_KEY_LAST_DISMISS_TYPE] ?? null;
}

async function clearDismissed(): Promise<void> {
  await chrome.storage.local.remove([
    STORAGE_KEY_DISMISSED_VERSION,
    STORAGE_KEY_DISMISSED_TIME,
    STORAGE_KEY_LAST_DISMISS_TYPE,
  ]);
}

async function getLastCheckTime(): Promise<number | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY_LAST_CHECK_TIME);
  return result[STORAGE_KEY_LAST_CHECK_TIME] ?? null;
}

/** 读取冷却期结果缓存 */
async function getCachedResult(): Promise<UpdateCheckResult | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY_LAST_CHECK_RESULT);
  const value = result[STORAGE_KEY_LAST_CHECK_RESULT];
  return value ?? null;
}

/** 写入冷却期结果缓存 */
async function cacheResult(checkResult: UpdateCheckResult): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY_LAST_CHECK_RESULT]: checkResult });
}

async function updateLastCheckTime(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY_LAST_CHECK_TIME]: Date.now() });
}
