# SecTools

安全运营 / 反入侵工程师日常瑞士军刀 Chrome 扩展。选中文本即弹窗、Popup 10 大常用工具面板，一站式搞定 IOC 查询、URL 分析、编解码、哈希、正则、CIDR、时间戳、格式化。

## 功能（10 Tab 按使用频率左→右）

| 模块 | 功能 |
|------|------|
| 🛡️ **威胁情报** | 12 大情报源并行查询（默认勾选 VirusTotal + 微步 ThreatBook）；支持 IP/Domain/URL/MD5/SHA1/SHA256/SHA512/Email/CVE/ASN 自动类型识别；可自定义默认勾选 |
| 🔗 **URL 分析** | URL 结构拆解 + 同形异义字检测 + 短链还原（最多 20 hop，HEAD→GET 降级）+ CSP favicon hash 比对 |
| 📦 **编解码** | Base64、Base32、Hex、URL、Unicode、HTML 实体编解码；JWT 解析；**多层自动解码引擎**（最大 10 层） |
| 🔐 **加密哈希** | MD5、SHA1、SHA256、SHA512 哈希；HMAC；AES 加解密（CBC/ECB/GCM/CTR）（Web Crypto 安全源） |
| 🔍 **正则** | 匹配高亮 + 替换预览 + **Sigma 规则 Lint + Yara 规则 Lint**；内置常用正则库 |
| 🌐 **网络** | CIDR 计算（掩码/网络/广播/主机数/包含判断）；IP 归属离线查询（ip2region xdb 8.3MB，全球 99%+ 覆盖）；RDAP 查询（IP/Domain/ASN） |
| 📄 **格式化** | JSON 格式化/压缩/校验/转义/JSONPath/JSON Diff；Python/SQL/XML 格式化；JSON 可折叠树视图 |
| 🕒 **时间转换** | Unix 时间戳（秒/毫秒/微秒/纳秒） ↔ 可读时间；FILETIME ↔ 可读时间；当前时间实时显示 |
| 🔢 **进制转换** | 二进制/八进制/十进制/十六进制互转；Hex Viewer 字节视图 |
| 🎲 **生成器** | UUID（批量+大小写）；强随机密码（排除易混淆字符可选）；随机串（字母/数字/十六进制/全字符）；随机整数（无偏采样）；随机字节（Web Crypto 安全源） |

## 选中文本浮动工具栏（Content Script）

选中任意网页文本 → 自动弹出 3 按钮（Shadow DOM 隔离，绝不污染宿主页面样式）：

| 按钮 | 功能 |
|------|------|
| 📦 解码 | 多层自动解码（Base64/URL/Hex/Unicode/HTML/JWT），结果在同页面下方浮动面板展示，一键复制 |
| 🔍 情报查询 | 下拉勾选 10 个默认情报源，并行打开新标签；默认勾选与 Popup 设置的「默认情报源勾选」100% 同步 |
| 🔗 URL 分析 | 仅在识别为 URL/Domain 时可用；结构拆解 + 同形异义字检测 + 短链还原结果面板 |

> 📋 **页面范围名单控制**：在 Popup「设置 → 选中文本浮动工具栏」中配置——白名单非空时命中才弹框（黑名单不参与）；白名单空 + 黑名单非空 = 默认全弹、命中排除；两名单皆空 = 全部页面弹框（默认全开）。规则一行一条：纯域名 / `*.通配符` / CIDR 或单 IP / `/正则/i`；`*` 单独一行 = 全页面。修改后当前页面即时生效，右键菜单不受影响。

> 💡 旧版的独立「VT」「微步」按钮已合并入「🔍情报查询」下拉，节省工具栏空间，所有情报源统一管理。

## 代码目录结构

```
sectools-chrome-extension/
├── .spec/                       # 需求驱动的 Spec YAML（新增需求先写 spec 再改代码）
├── public/                      # 构建时 1:1 拷贝到 dist/
│   ├── manifest.json            # MV3 扩展清单（权限、popup、background、icons）
│   ├── icons/                   # icon16 / icon48 / icon128.png
│   └── data/ip2region.db        # IP 归属离线库（8.3MB，不打包进 JS，独立文件分发）
├── scripts/gen_icons.py         # 一键生成多尺寸 PNG 图标
├── src/
│   ├── background/index.ts      # Service Worker：content↔background 消息协议（短链还原/RDAP/新标签/通知+Badge）
│   ├── content/index.ts         # 选中文本浮动工具栏 + Shadow DOM 3 按钮 + 面板
│   ├── popup/                   # React UI（10 Tab 面板 + App.tsx Tab 路由）
│   │   └── components/          # IntelPanel / UrlPanel / RegexPanel / NetworkPanel 等 14 个组件
│   ├── types/                   # 全局类型（AppSettings、ToolResult<T>、IocType、IntelSourceType...）
│   ├── utils/                   # 🟢 纯函数模块（零 DOM 依赖，全部可 Vitest 单测）
│   └── __tests__/               # Vitest 单测
├── AGENTS.md                    # AI Agent 工作规则（Trae/Claude/Cursor/Windsurf 单一真相源）
├── .cursorrules / .windsurfrules# 引用 AGENTS.md（Claude Code 原生读 AGENTS.md 无需额外文件）
├── CHANGELOG.md                 # 版本变更（Added/Changed/Fixed/Removed，每次 push 前必须更新）
├── README.md
├── package.json                 # version 与 CHANGELOG 顶部条目必须一致
├── tsconfig.json                # strict: true + noUnusedLocals/Parameters（必须通过）
├── vite.config.ts               # crx + react + modulePreload:false（消除 MV3 cross-world 警告）
└── tailwind.config.js / postcss.config.js
```

> 🎯 **分层铁律**：`utils/` 下为**纯函数**，返回统一 `ToolResult<T>` = `{ success, data?, error? }` 结构；`popup/components/` 与 `content/` 只负责调用 utils + 渲染/交互，不写业务逻辑。

## 开发

```bash
# 安装依赖
npm install

# 开发模式（Vite HMR + CRXJS 热重载扩展）
npm run dev

# 生产构建（tsc + vite build → dist/）
npm run build

# 类型检查（严格模式，零 unused 变量/参数）
npm run typecheck

# 单元测试（Vitest + jsdom）
npm run test           # 单次
npm run test:watch     # 监听模式

# 🟢 健康检查三合一（pre-push 钩子自动跑，失败拒绝 push）
npm run doctor         # = typecheck + test + build

# 打包可发布 zip（产物在项目根目录 sectools-v{version}.zip）
npm run zip

# 一键发布 = build + zip
npm run release
```

## Spec 驱动开发（新增需求 SOP）

```
1. 用户提需求
   → 2. 在 .spec/{feature}.spec.yaml 写：id / title / description / acceptance-criteria
   → 3. 发用户确认 spec
   → 4. 确认后再动手改 src/ 代码 + 补 Vitest 单测
   → 5. 更新 CHANGELOG.md + README.md + package.json version
   → 6. 过 npm run doctor
   → 7. push
```
本项目已有 9 份存量 Spec 可参考（`ls .spec/`）。

## 加载到 Chrome

1. `npm run build` 或 `npm run release`（推荐后者，同时得到 zip）
2. 打开 `chrome://extensions/`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择 `dist/` 目录 → 完成

## 版本更新（方案 C：GitHub Releases 自托管）

不依赖 Chrome Web Store，**无论你是开发模式加载 / 自托管 zip / 已上架 Web Store**，都能收到更新提示：

| 触发时机 | 行为 |
|---|---|
| 打开 Popup（每 1 小时最多 1 次） | Service Worker 后台请求 `https://api.github.com/repos/FrankYuBo/sectools-chrome-extension/releases/latest` 拿最新 `tag_name` |
| 发现新版本（semver 比较） | ① 扩展图标右上角显示 **NEW** 绿色 Badge ② Popup 顶部显示绿 Banner：「新版本 vX.Y.Z 可用（当前 vA.B.C）」 + **[下载更新]** 按钮 |
| 用户点击「下载更新」 | 新标签页打开 GitHub Releases 对应版本页 → 下载 `sectools-vX.Y.Z.zip` → `chrome://extensions` 覆盖加载即可 |
| 离线 / GitHub 限流 403 | 静默降级，不报错不打扰，次小时冷却结束自动重试 |
| 忽略机制 | Banner 有 **[忽略]**（本次会话关闭，下次仍弹）/ **[不再提示]**（storage 保存，永远不弹该版本）两档 |

> 💡 维护者发布新版本 SOP：升版本号 → `npm run release` 打包 zip → git commit + `git tag vX.Y.Z` → push → GitHub Releases 页面填标题、贴 CHANGELOG、上传 zip → 发布完成。用户下一次打开 Popup 即可自动看到更新。

## 打赏

如果这个工具对你有帮助，欢迎打赏！扫码随意即可，感谢支持。

<img src="public/wechat-pay.jpeg" alt="微信打赏" width="200" />

---

## Push 前 Checklist（强制，由 simple-git-hooks + pre-push 保障）

```
[ ] package.json version 与 CHANGELOG 顶部条目一致
[ ] CHANGELOG.md 已加对应版本条目
[ ] README.md 已同步功能/结构/命令
[ ] 新增需求已写 .spec/*.yaml
[ ] npm run doctor 通过
```
