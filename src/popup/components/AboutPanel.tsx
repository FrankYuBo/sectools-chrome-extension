import React, { useState } from 'react';
import { GITHUB_REPO_URL, GITHUB_RELEASES_URL } from '../../utils';

interface AboutPanelProps {
  currentVersion: string;
  onClose: () => void;
  onCheckUpdate: () => void;
}

const BILIBILI_URL = 'https://space.bilibili.com/374432302';

const linkCls =
  'text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 underline-offset-2 hover:underline break-all transition-colors';

const AboutPanel: React.FC<AboutPanelProps> = ({ currentVersion, onClose, onCheckUpdate }) => {
  const [showQR, setShowQR] = useState(false);

  return (
    <div className="relative flex flex-col h-full bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">关于</h2>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-6 text-center space-y-4 overflow-auto">
        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-500/20 shrink-0">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>

        <div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">SecTools</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">v{currentVersion}</p>
        </div>

        {/* 介绍文字 + 社交链接 */}
        <div className="text-xs text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed space-y-1">
          <p>安全工程师的 Chrome 工具箱。提供编解码、加密哈希、格式化、时间转换、进制转换等常用工具。</p>
          <p>
            微信公众号：<span className="text-slate-700 dark:text-slate-300">一路狂飚的蜗牛</span>
          </p>
          <p>
            B 站：
            <a href={BILIBILI_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>
              {BILIBILI_URL}
            </a>
          </p>
          <p>
            源码仓库：
            <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>
              GitHub / {GITHUB_REPO_URL.split('/').slice(-2).join('/')}
            </a>
          </p>
        </div>

        {/* 操作按钮区 */}
        <div className="flex flex-wrap gap-2 mt-2 justify-center">
          <button
            onClick={onCheckUpdate}
            className="text-xs px-4 py-1.5 rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors"
          >
            检查更新
          </button>
          <a
            href={GITHUB_RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-4 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-100 transition-colors"
          >
            GitHub Releases
          </a>
        </div>

        {/* 打赏 */}
        <button
          onClick={() => setShowQR(true)}
          className="text-xs px-4 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:hover:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40 transition-colors"
        >
          请作者喝杯咖啡
        </button>

        <div className="text-2xs text-slate-400 dark:text-slate-500 space-y-1 pt-2">
          <p>纯本地运算，无数据上传</p>
          <p>采用 Manifest V3 · React + TypeScript</p>
        </div>
      </div>

      {/* 二维码弹窗 */}
      {showQR && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setShowQR(false)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-5 max-w-[240px]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 text-center mb-3">微信扫码打赏</p>
            <img src="/wechat-pay.jpeg" alt="微信打赏" className="w-48 h-48 object-contain rounded" />
            <button
              onClick={() => setShowQR(false)}
              className="mt-3 w-full text-xs py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-300 transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AboutPanel;
