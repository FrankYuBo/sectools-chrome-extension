# SecTools — AI Agent Working Rules (AGENTS.md)

> 适用于：Trae / Claude Code / Cursor (Codex) / Windsurf / 任何 AI 代码助手。
> 单一信息源，本文件为所有 Agent 行为规范的唯一真相，其他规则文件通过引用此文件保持同步。

---

## 1. 项目概览

| 项 | 值 |
|---|---|
| **项目名称** | SecTools Chrome 扩展 |
| **定位** | 安全运营 / 反入侵工程师日常瑞士军刀：编解码、哈希、威胁情报、URL 分析、正则、CIDR、时间戳、格式化等一键可用 |
| **技术栈** | Chrome Manifest V3 · Vite 8 · TypeScript 5.5 (strict) · React 18 · Tailwind CSS 3.4 · Vitest 4 · Shadow DOM (content script 隔离) |
| **当前版本** | 0.4.0 |
| **包管理** | npm（node_modules / package-lock.json，不混用 pnpm/yarn） |
| **代码托管** | GitHub 私有仓库（FrankYuBo/sectools-chrome-extension） |

---

## 2. 目录结构（必须与代码保持一致，修改结构请同步更新本节）

```
sectools-chrome-extension/
├── .spec/                       # 需求驱动的 Spec YAML（新增需求先写 spec 再改代码！）
│   ├── project.spec.yaml
│   ├── settings.spec.yaml
│   ├── encode-decode.spec.yaml
│   ├── crypto-hash.spec.yaml
│   ├── formatter.spec.yaml
│   ├── timestamp.spec.yaml
│   ├── number-base.spec.yaml
│   ├── context-menu.spec.yaml
│   ├── selection-toolbar-filter.spec.yaml
│   └── version-update.spec.yaml
├── public/                      # 构建时 1:1 拷贝到 dist/
│   ├── manifest.json            # MV3 扩展清单（权限、popup、background、icons）
│   ├── icons/                   # icon16 / icon48 / icon128.png
│   ├── data/ip2region.db        # IP 归属离线库（8.3MB）
│   └── offscreen.html / .js     # 离屏文档兜底
├── scripts/
│   └── gen_icons.py             # 一键生成多尺寸 PNG 图标
├── src/
│   ├── background/
│   │   └── index.ts             # Service Worker：处理 content/popup 消息（短链还原 / RDAP / 打开新标签 / 通知 + Badge）
│   ├── content/
│   │   └── index.ts             # 选中文本浮动工具栏（Shadow DOM 隔离）：解码 / 🔍情报查询 / 🔗URL分析 三个按钮 + 下拉面板
│   ├── popup/                   # React 弹窗 UI（10 个 Tab 面板）
│   ├── settings-page/            # 独立配置页（新浏览器标签页）
│   │   ├── index.html · main.tsx · App.tsx  · index.css · contracts.ts
│   │   └── components/          # 14 个 React 组件
│   │       ├── IntelPanel.tsx              # 威胁情报（12 源，默认 VT+微步勾选）
│   │       ├── UrlPanel.tsx                # URL 分析（拆解 + 同形异义字 + 短链还原 + CSP favicon hash）
│   │       ├── RegexPanel.tsx              # 正则匹配 + Sigma/Yara Lint
│   │       ├── NetworkPanel.tsx            # CIDR 计算 + IP 归属(ip2region) + RDAP + Whois
│   │       ├── EncodeDecodePanel.tsx       # Base64/32/Hex/URL/Unicode/HTML/JWT + 多层自动解码
│   │       ├── CryptoHashPanel.tsx         # MD5/SHA 系列 + HMAC + AES(CBC/ECB/GCM/CTR)
│   │       ├── FormatterPanel.tsx          # JSON 美化/压缩/Path/Diff + Python/SQL/XML
│   │       ├── TimestampPanel.tsx          # Unix / FILETIME / 人类时间 互转（秒/毫秒/微秒/纳秒）
│   │       ├── NumberBasePanel.tsx         # 2/8/10/16 进制互转 + Hex Viewer
│   │       ├── GeneratorPanel.tsx          # UUID / 密码 / 随机串 / 整数 / 随机字节（Web Crypto 安全随机）
│   │       ├── SettingsPanel.tsx           # 设置面板（主题 / 自动复制 / 解码深度 / 情报默认勾选）
│   │       ├── AboutPanel.tsx              # 版本 + 许可证
│   │       ├── UpdateBanner.tsx            # 版本更新横幅
│   │       └── JsonTree.tsx                # JSON 可折叠树通用组件
│   ├── types/
│   │   ├── index.ts             # 全局类型：AppSettings、IocType、IntelSourceType、ToolResult<T>、PageTab、UpdateCheckResult
│   │   └── regex-yara-sigma.ts  # 正则 / Sigma / Yara Lint 专属类型
│   ├── utils/                   # 🟢 纯函数模块（零 DOM / 零 UI 依赖，全部可独立 Vitest 单测）
│   │   ├── index.ts             # 统一导出入口
│   │   ├── settings.ts          # chrome.storage.local 读写 + Schema 版本迁移 + onSettingsChanged 监听
│   │   ├── intel-sources.ts     # 12 大情报源 buildUrl 函数 + INTEL_SOURCES 定义表
│   │   ├── ioc-detector.ts      # 选中文本 IOC 类型识别（IP/Domain/URL/Hash/CVE/Email/AS）
│   │   ├── encode-decode.ts     # 编解码 + 多层自动解码（最大 10 层）
│   │   ├── crypto-hash.ts       # 哈希 / HMAC / AES（Web Crypto API）
│   │   ├── formatter.ts         # JSON/Python/SQL/XML 格式化 + JSONPath + JSON Diff
│   │   ├── timestamp.ts         # 时间戳系列转换
│   │   ├── number-base.ts       # 进制转换 + Hex Viewer
│   │   ├── generator.ts         # 生成器系列（Web Crypto getRandomValues）
│   │   ├── url-analyzer.ts      # URL 拆解 + 同形异义字(homoglyph)检测
│   │   ├── homoglyph.ts         # 同形异义字数据 + 算法
│   │   ├── ioc-detector.ts      # （同上，重复行提醒位置）
│   │   ├── cidr.ts              # CIDR 计算（网络/广播/掩码/主机数/包含判断）
│   │   ├── ip2region.ts         # ip2region xdb 离线查询封装
│   │   ├── sigma-lint.ts        # Sigma 规则语法 Lint
│   │   ├── yara-lint.ts         # Yara 规则语法 Lint
│   │   ├── builtin-regex.ts     # 内置常用正则（IPv4/Email/域名/URL/Hash/CVE）
│   │   ├── cron-describe.ts     # Cron 表达式人类可读描述
│   │   ├── selection-filter.ts  # 选中文本工具栏域名过滤（白名单/黑名单/通配符）
│   │   └── version-update.ts    # GitHub Releases 版本更新检查
│   └── __tests__/               # Vitest 单测（命名：{module}.test.ts）
│       ├── context-menu-sim.test.ts
│       ├── crypto-hash.test.ts
│       ├── encode-decode.test.ts
│       ├── intel-sources.test.ts
│       ├── ioc-detector.test.ts
│       ├── selection-filter.test.ts
│       ├── url-analyzer.test.ts
│       └── version-update-sim.test.ts
├── AGENTS.md                    # ← 你正在读的本文件
├── README.md
├── CHANGELOG.md
├── package.json
├── package-lock.json
├── tsconfig.json                # strict: true + noUnusedLocals/Parameters: true（必须通过）
├── vite.config.ts               # crx + react + modulePreload:false（消 MV3 cross-world 警告）
├── tailwind.config.js
├── postcss.config.js
└── .gitignore
```

---

## 3. ⭐ Push 前 Checklist（强制，任何改动必须逐项勾选）

```
[ ] 1. 版本号同步：package.json "version" 与 CHANGELOG.md 顶部条目版本一致
[ ] 2. CHANGELOG.md 已追加对应版本条目（Added/Changed/Fixed/Removed 四类，不可少写）
[ ] 3. README.md 已同步：功能表 / 目录结构 / 新增命令 / 新面板说明
[ ] 4. Spec 文档：如果是新增功能 / 变更需求，.spec/ 下已补 / 已更新对应 spec.yaml
[ ] 5. Code Health：npm run doctor 三绿通过：
         - tsc --noEmit （严格模式，零 unused 变量/参数）
         - vitest run （新增 utils 模块必须加单测）
         - vite build （零警告，dist/ 产物可直接加载到 Chrome）
[ ] 6. 构建产物验证：npm run zip 生成的 sectools-v{version}.zip 大小正常
```

**未通过 Checklist 不允许 push**——simple-git-hooks 的 pre-push 钩子会自动跑 `npm run doctor`，失败拒绝 push。

---

## 4. 代码规范（必须遵守，否则 typecheck / lint 会挂）

### 4.1 分层铁律
| 层 | 能做什么 | 不能做什么 |
|---|---|---|
| **utils/** | 纯函数 / 输入→输出 / 返回 `ToolResult<T>` = `{ success: boolean; data?: T; error?: string }` | 访问 DOM / 调 chrome.* API / 写副作用（localStorage/fetch 除了 url-analyzer 这种纯 HTTP 工具） |
| **popup/components/** | 调 utils / useState/useEffect / 渲染 UI / 读 settings | 写业务逻辑（必须下沉到 utils） |
| **content/index.ts** | DOM 操作（选中文本 + 浮动工具栏 Shadow DOM） | 写样式到全局（必须注入到 Shadow Root） |
| **background/index.ts** | Service Worker：跨域 fetch、chrome.tabs.create、chrome.notifications | 访问 DOM / 保留长状态（MV3 30s 休眠，必须持久化到 storage） |

### 4.2 命名约定
- 类型 / 接口：`PascalCase`（`AppSettings`、`ToolResult`、`IocType`）
- 枚举值 / 常量字符串数组：`UPPER_SNAKE_CASE`（`DEFAULT_INTEL_SOURCES`）
- 函数 / 变量：`camelCase`（`buildThreatBookUrl`、`detectSelectionIoc`）
- React 组件 / 文件：`PascalCase.tsx`（`IntelPanel.tsx`、`SettingsPanel.tsx`）
- utils 模块：`kebab-case.ts`（`crypto-hash.ts`、`ioc-detector.ts`）

### 4.3 安全规范
- **Content Script**：样式必须 `shadowRoot.innerHTML` 注入，绝不污染宿主 `document.body`
- **innerHTML 内容**：只使用硬编码的 SVG / HTML 模板，绝不把用户选中的文本 `innerHTML = userText`（必须用 `textContent`）
- **URL 打开**：情报源跳转必须走 `encodeURIComponent(value)`，绝不拼原始选中值
- **chrome.storage.local**：敏感配置（如未来加 API Key）不能直接明文，要走 `chrome.storage.session` 或加密

### 4.4 Spec 驱动开发（新增需求 SOP）
```
1. 用户提需求 → 2. 在 .spec/{feature}.spec.yaml 写：
   id / title / description / user-story / acceptance-criteria / technical-notes
   → 3. 发用户确认 spec → 4. 确认后再动手改 src/ 代码 → 5. 补单测 → 6. 过 checklist push
```
已有 10 个存量 spec 做参考，别跳过。

---

## 5. 核心交互链路（Message Protocol）

Content / Popup ↔ Background 的 chrome.runtime.sendMessage 统一协议：

```ts
type RuntimeMessage =
  | { type: 'sec:open-tab'; url: string; active?: boolean }      // 打开新标签（情报源跳转用）
  | { type: 'sec:notify'; title: string; message: string }        // 桌面通知 + action Badge
  | { type: 'sec:unshorten-url'; url: string; maxHops?: number }  // 短链还原（最多 20 hop）
  | { type: 'sec:rdap-query'; target: string }                     // RDAP 查询（IP/Domain/ASN）
```

返回结构统一：`{ ok: boolean; data?: T; error?: string }`。

---

## 6. 测试与提交规范

### 6.1 Vitest 单测
- utils 新增 / 修改模块 **必须** 在 `src/__tests__/` 下补 `{module}.test.ts`
- 最低覆盖：核心纯函数（encode-decode / intel-sources / ioc-detector / crypto-hash / url-analyzer）
- 运行：`npm run test` 或 `npm run test:watch`

### 6.2 Conventional Commits
```
feat: 新增面板 / 新功能
fix: 修复 bug（例：fix(threatbook): 统一使用 generalSearch URL，避免 404）
docs: README / CHANGELOG / AGENTS 文档变更
refactor: 不改功能的代码重构
chore: 构建工具、依赖、脚本变更（例：chore: add simple-git-hooks pre-push）
test: 新增 / 修改单测
```

### 6.3 发布流程（Release）
```bash
# 1. 改 package.json version 到 x.y.z
# 2. CHANGELOG.md 顶部加 "## x.y.z (YYYY-MM-DD)" 条目
# 3. 过 Push 前 Checklist
npm run release   # = npm run build + 打包 dist/ 为 sectools-vx.y.z.zip
# 4. Chrome Web Store 上传 zip；GitHub 打 vx.y.z tag + Releases 上传 zip
```
