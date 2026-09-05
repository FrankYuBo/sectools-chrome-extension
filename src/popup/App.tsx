import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  initSettings,
  saveSettings,
  checkForUpdate,
  getCurrentVersion,
  showUpdateBadge,
  clearUpdateBadge,
  shouldShowUpdateBanner,
  getEffectiveTheme,
} from '../utils';
import type { AppSettings, UpdateCheckResult, TabId } from '../types';
import { usePersistentState } from '../utils/persistent-state';

import EncodeDecodePanel from './components/EncodeDecodePanel';
import CryptoHashPanel from './components/CryptoHashPanel';
import FormatterPanel from './components/FormatterPanel';
import TimestampPanel from './components/TimestampPanel';
import NumberBasePanel from './components/NumberBasePanel';
import GeneratorPanel from './components/GeneratorPanel';
import NetworkPanel from './components/NetworkPanel';
import RegexPanel from './components/RegexPanel';
import IntelPanel from './components/IntelPanel';
import UrlPanel from './components/UrlPanel';
import SettingsPanel from './components/SettingsPanel';
import AboutPanel from './components/AboutPanel';
import UpdateBanner from './components/UpdateBanner';

interface TabMeta {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const ALL_TABS: Record<TabId, TabMeta> = {
  intel: {
    id: 'intel',
    label: '威胁情报',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
  },
  url: {
    id: 'url',
    label: 'URL分析',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
  },
  encode: {
    id: 'encode',
    label: '编解码',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  crypto: {
    id: 'crypto',
    label: '加密哈希',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
  },
  regex: {
    id: 'regex',
    label: '正则',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M10 20v-6a2 2 0 012-2h0a2 2 0 012 2v6M14 4v4m-4 0h4M5 8h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2v-8a2 2 0 012-2z" />
      </svg>
    ),
  },
  network: {
    id: 'network',
    label: '网络',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M2 12h4l3-9 4 18 3-9h6" />
      </svg>
    ),
  },
  format: {
    id: 'format',
    label: '格式化',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    ),
  },
  timestamp: {
    id: 'timestamp',
    label: '时间转换',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  number: {
    id: 'number',
    label: '进制转换',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
      </svg>
    ),
  },
  generator: {
    id: 'generator',
    label: '生成器',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
  },
};

const App: React.FC = () => {
  // 记忆上次关闭时所在面板（恢复值若已被隐藏/移除，由下方 validity effect 兜底回第一个可见 Tab）
  const [activeTab, setActiveTab] = usePersistentState<TabId>('app.activeTab', 'encode');
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckResult | null>(null);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // ---- Init ----
  useEffect(() => {
    (async () => {
      // 设置读取（chrome.storage 本地，毫秒级）——完成后立即渲染首屏
      const s = await initSettings();
      setSettings(s);
      setInitialized(true);

      // 更新检查放后台执行，不阻塞首屏（网络慢 / GitHub 不可达时用户无感知，
      // 横幅在检查完成后异步出现）
      const update = await checkForUpdate();
      setUpdateCheck(update);

      if (update.hasUpdate && update.latestVersion) {
        showUpdateBadge();
        const showBanner = await shouldShowUpdateBanner(update.latestVersion);
        setShowUpdateBanner(showBanner);
      } else {
        clearUpdateBadge();
      }
    })();
  }, []);

  // ---- Theme effect ----
  useEffect(() => {
    if (!settings) return;
    const effective = getEffectiveTheme(settings.themeMode);
    const root = document.documentElement;
    root.setAttribute('data-theme', effective);
    if (effective === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [settings?.themeMode]);

  // ---- Settings handlers ----
  const handleUpdateSettings = useCallback(
    async (partial: Partial<AppSettings>) => {
      if (!settings) return;
      const merged = { ...settings, ...partial };
      setSettings(merged);
      await saveSettings(merged);
    },
    [settings],
  );

  // ---- Toast ----
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }, []);

  // ---- Auto copy ----
  const handleAutoCopy = useCallback(
    async (text: string) => {
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text.trimEnd());
        showToast('已复制到剪贴板');
      } catch {
        // clipboard write failed, silently ignore
      }
    },
    [showToast],
  );

  // ---- Update banner dismiss ----
  const handleBannerDismiss = useCallback(() => {
    setShowUpdateBanner(false);
    clearUpdateBadge();
  }, []);

  // ---- Check update manually ----
  const handleCheckUpdate = useCallback(async () => {
    const update = await checkForUpdate({ force: true });
      setUpdateCheck(update);
      if (update.hasUpdate && update.latestVersion) {
        showUpdateBadge();
        const showBanner = await shouldShowUpdateBanner(update.latestVersion);
        setShowUpdateBanner(showBanner);
        showToast(`发现新版本 ${update.latestVersion}`);
      } else {
        showToast('已是最新版本');
      }
  }, [showToast]);

  // ---- Dynamic tabs ----
  const visibleTabs = useMemo(() => {
    if (!settings) return [];
    const hiddenSet = new Set(settings.hiddenTabs);
    return settings.tabOrder
      .filter((id) => !hiddenSet.has(id))
      .map((id) => ALL_TABS[id]);
  }, [settings]);

  // Ensure activeTab is valid when tabs change
  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some((t) => t.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab]);

  // ---- Loading state ----
  if (!initialized || !settings) {
    return (
      <div className="flex items-center justify-center h-full bg-white dark:bg-slate-900">
        <div className="text-sm text-slate-400">加载中...</div>
      </div>
    );
  }

  // ---- Current page ----
  const isPage = !showSettings && !showAbout;

  const renderPanel = () => {
    if (showSettings) {
      return (
        <SettingsPanel
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          onClose={() => setShowSettings(false)}
        />
      );
    }

    if (showAbout) {
      return (
        <AboutPanel
          currentVersion={updateCheck?.currentVersion ?? getCurrentVersion()}
          onClose={() => setShowAbout(false)}
          onCheckUpdate={handleCheckUpdate}
        />
      );
    }

    switch (activeTab) {
      case 'encode':
        return <EncodeDecodePanel onAutoCopy={handleAutoCopy} />;
      case 'crypto':
        return <CryptoHashPanel onAutoCopy={handleAutoCopy} />;
      case 'format':
        return <FormatterPanel settings={settings} onAutoCopy={handleAutoCopy} />;
      case 'timestamp':
        return <TimestampPanel settings={settings} onAutoCopy={handleAutoCopy} />;
      case 'number':
        return <NumberBasePanel onAutoCopy={handleAutoCopy} />;
      case 'generator':
        return <GeneratorPanel settings={settings} onAutoCopy={handleAutoCopy} />;
      case 'network':
        return <NetworkPanel onAutoCopy={handleAutoCopy} />;
      case 'regex':
        return <RegexPanel onAutoCopy={handleAutoCopy} />;
      case 'intel':
        return <IntelPanel settings={settings} onAutoCopy={handleAutoCopy} />;
      case 'url':
        return <UrlPanel onAutoCopy={handleAutoCopy} />;
    }
  };

  return (
    <div className="flex flex-col h-[560px] w-[800px] bg-white dark:bg-slate-900">
      {/* Update Banner */}
      {showUpdateBanner && updateCheck && updateCheck.latestVersion && (
        <UpdateBanner update={updateCheck} onDismiss={handleBannerDismiss} />
      )}

      {/* Top nav tabs */}
      <nav className="flex items-center px-2 py-1.5 gap-0.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 shrink-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setShowSettings(false);
              setShowAbout(false);
            }}
            className={`shrink-0 flex items-center gap-1 px-1.5 py-1.5 rounded-md text-2xs font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.id && isPage
                ? 'bg-primary-500 text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}

        <div className="flex-1" />

        {/* Footer icons: settings, about */}
        <button
          onClick={() => {
            setShowSettings(true);
            setShowAbout(false);
          }}
          title="设置"
          className={`p-1.5 rounded-md transition-colors ${
            showSettings
              ? 'bg-primary-50 dark:bg-primary-500/10 text-primary-500'
              : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        <button
          onClick={() => {
            setShowAbout(true);
            setShowSettings(false);
          }}
          title="关于"
          className={`p-1.5 rounded-md transition-colors ${
            showAbout
              ? 'bg-primary-50 dark:bg-primary-500/10 text-primary-500'
              : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </nav>

      {/* Main content area */}
      <div className="flex-1 overflow-hidden">
        {renderPanel()}
      </div>

      {/* Toast notification */}
      {toast && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div className="text-xs bg-slate-800 dark:bg-slate-700 text-white px-4 py-2 rounded-lg shadow-lg animate-pulse">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
