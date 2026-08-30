import React from 'react';
import type { UpdateCheckResult, DismissLevel } from '../../utils';
import { dismissUpdate, GITHUB_RELEASES_URL } from '../../utils';

interface UpdateBannerProps {
  update: UpdateCheckResult;
  onDismiss: () => void;
}

const openInNewTab = (url: string): void => {
  chrome.runtime.sendMessage(
    { type: 'sec:open-tab', url, active: true },
    () => {
      if (chrome.runtime.lastError) {
        // fallback：popup 内 window.open（极端兜底）
        try { window.open(url, '_blank', 'noopener,noreferrer'); } catch {
          /* ignore */
        }
      }
    },
  );
};

const UpdateBanner: React.FC<UpdateBannerProps> = ({ update, onDismiss }) => {
  const handleDismiss = async (level: DismissLevel) => {
    await dismissUpdate(update.latestVersion || '', level);
    onDismiss();
  };

  const handleDownload = () => {
    const target = update.releaseUrl || GITHUB_RELEASES_URL;
    openInNewTab(target);
  };

  return (
    <div className="bg-green-50 border-b border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300">
      <div className="flex items-center justify-between px-3 py-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm shrink-0">&#9679;</span>
          <span className="text-xs truncate">
            新版本 <b className="text-green-900 dark:text-green-100">v{update.latestVersion}</b> 可用
            （当前 v{update.currentVersion}）
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleDownload}
            className="text-xs px-3 py-1 rounded bg-green-600 hover:bg-green-700 text-white font-medium transition-colors"
            title="前往 GitHub Releases 下载最新 zip"
          >
            下载更新
          </button>
          <button
            onClick={() => handleDismiss('once')}
            className="text-xs px-2 py-1 rounded hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
          >
            忽略
          </button>
          <button
            onClick={() => handleDismiss('forever')}
            className="text-xs px-2 py-1 rounded hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
          >
            不再提示
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpdateBanner;
