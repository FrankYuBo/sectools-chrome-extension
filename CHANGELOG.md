# Changelog

## 0.4.1 (2026-09-05)

### Added
- **Popup 面板记忆与输入输出持久化**：关闭再打开后恢复上次所在面板；各面板输入、选项与输出结果（生成器产物/解码结果/URL 分析与短链链路/查询结果等）原样保留，避免未复制的输出丢失——通用 hook `usePersistentState`（debounce 合并写 + 内存缓存，storage key `popupPanelState` 与配置导出导入独立）（spec: `.spec/popup-state-persistence.spec.yaml`）
- **配置导出/导入（迁移电脑）**：设置页顶部「配置迁移」区块——导出全部配置为 JSON（可选包含 API Key/MCP Token 等敏感信息，默认勾选并二次确认，脱敏导出清空所有密钥但保留结构）；导入经结构校验（app 标识/aiConfig 检查）+ 覆盖确认，低版本文件自动走 schema 迁移链升级（spec: `.spec/settings.spec.yaml` features.migration）
- **情报富化（免费 API + 本地实现）**：AI 研判前自动查询公开情报源并注入上下文——免 Key：URLhaus/ThreatFox/MalwareBazaar（abuse.ch）、CISA KEV 已知被利用漏洞比对、NVD CVE 详情、Cloudflare DoH 域名解析（与工单 IP 交叉验证）、本地 ip2region IP 归属（断网可用）；Key 型源（VirusTotal/AbuseIPDB/urlscan.io）未配置 Key 时自动跳过不影响其他功能；逐源串行 + 结果缓存（IOC 24h/DNS 1h/CVE 7d）+ 每类限量 3 条；内网地址不出网（spec: `.spec/enrichment.spec.yaml`，schema v6→v7）
- **MCP Server 集成（客户端）**：插件作为 MCP 客户端经 Streamable HTTP 连接外部 MCP Server，设置页管理服务器（URL/Token 密码框/启用/自动调用工具勾选，支持测试连接）；AI 研判前自动提取 IOC 匹配工具参数并调用（如查资产），结果注入研判上下文，聊天界面显示查询摘要；`Mcp-Session-Id` 自动缓存回传、会话过期(404)自动重建；连接 403 Invalid Origin 时错误信息附可复制的扩展 Origin 与服务端放行指引；stdio 型 Server 可经 supergateway/mcp-proxy 桥接（spec: `.spec/mcp-client.spec.yaml`，schema v4→v5）
- **运行日志系统**：环形缓冲 500 条（时间戳/级别/模块标签），覆盖 ai-trigger/ai-extract/ai-send/ai/mcp/enrich/unshorten 全链路；SW 侧日志持久化聚合，「复制日志」导出跨上下文（SW+content）合并全量；控制台 `__sectools_logs()` 系列 API（扩展上下文）（spec: `.spec/logging.spec.yaml`）
- **SOC 分析专家默认提示词模板**：Role/Task/ATT&CK 映射/IOC 提取/处置建议四段式结构化输出；旧默认模板用户升级自动替换（自定义模板保留），设置页新增「恢复默认」按钮（schema v5→v6）
- **短链还原增强**：证书过期降级链（HEAD→GET→HTTP 明文）、HEAD 非 3xx 自动 GET 复核、JS/Meta Refresh 跳转解析、跳转环检测、HTTP→HTTPS 弹回死局识别；UI 新增「⟾ 跳转链路」逐跳展示（URL/状态码/方法/Location/降级标注）与「跟踪受阻」状态（spec: `.spec/url-unshorten.spec.yaml`）
- **IDN 同形异义域名识别**：域名正则与校验器支持拉丁扩展/希腊/西里尔字符（排除 CJK 防误吞），负向后行断言兼容非 ASCII 开头域名；`gοogle.com`/`аpple-id.com` 完整提取，不再截断为 `ogle.com`/`pple-id.com`（spec: `.spec/ioc-idn-detection.spec.yaml`）
- **聊天 Markdown 渲染**：assistant 回复完整渲染标题/加粗/斜体/行内代码/代码块/有序无序列表/表格/引用/链接，全文本转义防 XSS

### Fixed
- **DOM 父选择器失效**：点击工具栏按钮时浏览器默认清除文本选区导致 `closest()` 落空；现选区存活时同步捕获锚点元素 + 点击时快照传递 + 工具栏 `mousedown` `preventDefault()`
- **AI API 报错不友好**：`signal timed out` 等裸错误改为分类可操作提示（超时/网络错误分别附排查建议与实际请求 URL）
- **短链完整链路**：MV3 opaque redirect 降级 follow 时通过 `webRequest.onBeforeRedirect` 捕获真实中间跳转并重建完整链路；跳转环安全终止；HEAD 200 页面经 GET 复核后继续解析 JS/Meta Refresh
- **脱敏开关关闭不恢复原文**：关闭时恢复脱敏前原始文本
- **lint 回归与 doctor 盲区**：修复 5 处 lint 错误（constant condition/自赋值/多余转义/控制字符正则等），`doctor` 质量门禁加入 `npm run lint`

### Changed
- **开关统一为 Chrome 扩管风格**：设置页、Popup 设置、聊天脱敏开关统一为拨动开关（圆点右=开、左=关，突出轨道），新增 Popup 共享 Toggle 组件（sm 紧凑档）
- **威胁情报源精简为 10 家**：移除 Intezer Analyze、VirusShare（spec 与测试同步）
- **DOM 父选择器提示对齐示例**：placeholder `tr.issue-row` → `tr.ticket-row`
- **spec 清理**：移除已被聊天组件取代的旧 aiSidebar 验收项，AC 同步重写消除内部矛盾
- **mock-tickets.html 演示工单扩充至 12 条**：新增 0896 木马失陷（含 SHA256/进程链/C2）、0895 短链钓鱼（bit.ly + rn 伪装）、0894 Webshell Base64 流量（真实可解码）、0893 同形异义域名（希腊/西里尔字符）、0892 API 撞库 JSON 日志

## 0.4.0 (2026-08-24)

### Added
- **高级配置页（独立浏览器标签页）**：Popup 设置面板底部新增「更多配置」按钮，点击打开独立 `settings.html` 全功能配置页，包含外观/行为/工具栏/情报源/Tab 排序/AI 研判所有设置区域（spec: `.spec/advanced-settings.spec.yaml`）
- **Tab 面板自定义排序与隐藏**：配置页中用 ↑↓ 按钮调整面板顺序；核心 6 个面板（威胁情报/URL分析/编解码/加密哈希/正则/网络）不可隐藏，其余 4 个可自由开关；排序和可见性持久化到 `chrome.storage.local`，Popup 下次打开即时生效
- **AI 研判功能**：选中文本浮动工具栏新增「AI 研判」按钮；配置 LLM 服务（Base URL / API Key / 模型（支持从 API 拉取列表选择）/ Prompt 模板（`{{content}}` 占位符）/ 可选 DOM 父选择器），选中页面文本后一键发送研判，结果在页面右侧 Shadow DOM 浮窗展示（spec: `.spec/ai-analysis.spec.yaml`）
- **DOM 父选择器文本提取**：配置 CSS 选择器后，选中工单列表文本时自动向上查找匹配祖先元素（`Element.closest()`），提取完整行内容发给 AI，不配置则回退到选中文本
- **OpenAI 兼容 API 支持**：兼容 OpenAI / Anthropic（国内代理）/ DeepSeek / Qwen / Moonshot / GLM / Ollama 等标准格式，Background Service Worker 执行请求避免 CORS
- **设置 Schema v2 → v3 自动迁移**：新增 `tabOrder` / `hiddenTabs` / `aiConfig` 三字段，老数据升级自动补默认值

### Changed
- **Popup Tab 栏改为动态渲染**：从硬编码 `TABS` 数组改为根据 `settings.tabOrder` 和 `settings.hiddenTabs` 动态生成，支持用户自定义排序和隐藏
- **Popup 设置面板精简**：仅保留主题切换、自动复制、解码深度三项常用设置，其余配置迁移至独立配置页

## 0.3.0 (2026-08-20)

### Added
- **选中文本浮动工具栏页面名单控制**：新增设置区块「选中文本浮动工具栏」，支持白名单 + 黑名单双名单，规则智能识别四种格式（纯域名含子域 / `*.通配符` / CIDR 或单 IP 视为 /32 / 正则仅 `i` 标志），一行一条，`*` 单独一行等价全页面启用（spec: `.spec/selection-toolbar-filter.spec.yaml`）
- **白名单优先语义**：白名单非空时仅命中页面弹框（黑名单完全不参与）；白名单空且黑名单非空时默认全部弹框、命中黑名单排除；两名单皆空时保持默认：全部页面弹框
- **设置校验与提示**：非法行实时标注「第 N 行：原因」（保存后运行时自动忽略）；白/黑名单同时非空时显示「黑名单不生效」冲突提示与正确配置引导；显示有效规则计数
- **动态生效**：设置变更后当前页面即时挂载/卸载浮动工具栏（全部监听器登记到清理队列，卸载移除 Shadow DOM 宿主，页面零残留），无需刷新页面
- **新增纯函数模块 `utils/selection-filter.ts`**：`parseSelectionRule` / `validateSelectionRules` / `matchSelectionHost` / `shouldShowSelectionToolbar`，复用 `cidr.ts` 网段判断不重复实现；配套单测 `src/__tests__/selection-filter.test.ts`（四类规则 × 白/黑名单 + 判定表全分支 + 边界）
- **设置 Schema v1 → v2 自动迁移**：新增 `selectionToolbarEnabled` / `selectionToolbarRules` / `selectionToolbarBlockRules` 三字段，老数据升级自动补默认值
- **关于面板打赏入口**：新增「请作者喝杯咖啡」按钮，点击弹出微信收款二维码弹窗（暗色主题适配）

### Changed
- **浮动工具栏新增总开关与页面名单控制**：默认开关开启、两名单皆空 = 全部页面弹框（保持 0.2.x 原有行为不变，无破坏性变更）；名单仅用于收窄/排除。右键菜单不受任何影响
- **Vite 5 → Vite 8 / Vitest 1.6 → Vitest 4 / @vitejs/plugin-react 4 → 6**：升级构建工具链修复 npm audit high 漏洞（Vite 中间件安全修复），同步适配 `vite.config.ts`（`import.meta.dirname` 替代 `__dirname`，JSON import attribute）；`@crxjs/vite-plugin` 2.7.1 已兼容 Vite 8
- **新增 ESLint 配置**：添加 `.eslintrc.cjs`（`eslint:recommended` + `@typescript-eslint/recommended`），`npm run lint` 从无配置报错变为零错误通过；同步修复 6 个源文件共 15 个 lint 错误（`no-empty` / `prefer-const` / `no-constant-condition` / `no-useless-escape` / `no-control-regex`）

### Fixed
- **Popup 打开「加载中...」约 3 秒**：更新检查（GitHub API 网络请求）此前串行阻塞首屏渲染，现改为后台异步执行——设置读取（毫秒级）完成后立即渲染界面，更新横幅检查完成后异步出现
- **版本更新检查冷却失效**：冷却期内仅在存在 `dismissedVersion` 时才提前返回（fall-through bug），导致每次打开 Popup 都请求 GitHub API；现冷却期内直接复用上次结果缓存（`lastUpdateCheckResult`），零网络请求
- **更新检查 fetch 无超时**：GitHub API 不可达 / 网络黑洞时依赖浏览器 TCP 超时（可达数十秒）；现增加 3s `AbortController` 超时快速失败并静默降级；新增模拟单测 `version-update-sim.test.ts` 覆盖冷却缓存 / forever 忽略 / 超时降级

## 0.2.1 (2026-08-18)

### Added
- **关于面板可点击链接**：B 站主页链接、GitHub 源码仓库链接、GitHub Releases 下载链接均改为 `<a target="_blank" rel="noopener noreferrer">` 蓝色可点击样式（hover 下划线）
- **关于面板新增「GitHub Releases」按钮**：灰色次级按钮，一键打开 `/releases/latest` 下载页，无需用户手动搜索
- **UpdateBanner 新增「下载更新」主按钮**：绿色主按钮，点击通过 Background `sec:open-tab` 打开 Release 页面，附带 `window.open` 兜底，避免 Popup 关闭导致新标签打开失败

### Changed
- **版本更新机制（方案 C）**：从依赖 `chrome.runtime.requestUpdateCheck()`（仅 Chrome Web Store 有效）改为自托管 **GitHub Releases API** 方案 —— 后台 `fetch https://api.github.com/repos/FrankYuBo/sectools-chrome-extension/releases/latest`，解析 `tag_name` 做 semver 三元组比较，适用于开发模式、自托管、Web Store 所有安装方式
- **版本号比较**：实现 `parseSemver` 提取主/次/修订号 + `isNewer` 按数字比较，支持带 `v` 前缀（`v0.2.1`）和预发布后缀（`-beta`），不再使用直接字符串比较
- **冷却与降级策略**：1 小时冷却、离线 / 403 限流静默降级不打扰、`dismissedVersion` 支持忽略一次 / 永久忽略、`shouldShowUpdateBanner` 决定是否弹出
- **`UpdateCheckResult` 接口扩展**：新增 `releaseUrl` 字段（从 GitHub API `html_url` 获取），传递给 Banner 直接跳转
- **utils/index.ts 导出扩展**：同步导出 `GITHUB_REPO_URL`、`GITHUB_RELEASES_URL` 常量，供 AboutPanel / UpdateBanner 复用

### Fixed
- **About 面板 B 站链接不可点击**：从纯文本改为可点击超链接，用户一键跳转到个人主页
- **离线模式下 UpdateBanner 错误展示**：fetch 抛出异常时 `hasUpdate` 强制为 `false`，避免因网络异常误显示更新提示

## 0.2.0 (2026-08-18)

### Added
- **选中文本浮动工具栏**（Content Script + Shadow DOM 隔离）：选中任意文本自动弹出「解码｜🔍情报查询｜🔗URL分析」3 按钮
- **🔍 情报查询下拉**：12 大威胁情报源（VirusTotal、微步 ThreatBook、AlienVault OTX、Hybrid Analysis、URLScan.io、AbuseIPDB、Shodan、Censys、ANY.RUN、Triage、Intezer、VirusShare），按 IOC 类型自动判断支持度，默认勾选 VT + 微步，并行打开（每 tab 120ms 间隔防浏览器限流）
- **10 Tab Popup 面板**（按使用频率左→右重排）：威胁情报、URL分析、编解码、加密哈希、正则、网络、格式化、时间转换、进制转换、生成器；Popup 宽度 560px→800px，10 Tab 全部显示无需滚动
- **URL 分析面板**：URL 结构拆解 + 同形异义字检测 + 短链还原（最多 20 hop，HEAD 优先 GET 降级）+ CSP favicon hash 比对
- **正则面板**：匹配结果高亮 + 替换预览 + Sigma 规则 Lint + Yara 规则 Lint；内置常用正则（IPv4/IPv6、邮箱、域名、URL、各类哈希、CVE）
- **网络面板**：CIDR 计算（掩码/网络/广播/主机数/包含判断）+ IP 归属离线查询（ip2region xdb 8.3MB）+ RDAP 查询（IP/Domain/ASN）+ Whois 入口
- **Agent 规范文档**：新增 `AGENTS.md`（Trae/Claude/Cursor/Windsurf 单一真相源）+ `.cursorrules` + `.windsurfrules`（均引用 AGENTS.md）
- **Push 前质量门禁**：`simple-git-hooks` + `pre-push` 钩子强制跑 `npm run doctor`（typecheck + test + build），失败拒绝 push
- **Chrome 扩展发布流水线**：`npm run release` = build + 打包 `sectools-v{version}.zip`（可直接上传 Chrome Web Store）
- **Storage Schema 版本化**：`SETTINGS_SCHEMA_VERSION = 1` + 迁移框架，老用户升级不会因字段缺失崩溃

### Changed
- 情报源默认勾选：从 8 家精简为 **仅 VirusTotal + 微步 ThreatBook**，其余情报源需手动在设置面板或情报下拉勾选
- 浮动工具栏：删除独立「VT / 微步」按钮，合并入「🔍情报查询」下拉（避免功能重复，节省工具栏空间）
- 微步（ThreatBook）跳转 URL：统一为 `https://x.threatbook.com/v5/generalSearch?q=` 通用搜索模式，不再按 IOC 类型分 URL，彻底修复「跳转 notFound / 404」
- Tab 顺序重排（按 SOC/反入侵工程师使用频率）：威胁情报 → URL分析 → 编解码 → 加密哈希 → 正则 → 网络 → 格式化 → 时间转换 → 进制转换 → 生成器
- Popup 主容器尺寸：`w-[560px] h-[560px]` → `w-[800px] h-[560px]`，10 个 Tab 一行放完，无需横向滚动
- package.json scripts：新增 `doctor` / `zip` / `release` / `prepare`；版本号同步至 0.2.0

### Fixed
- 浮动工具栏：在 `virustotal.com/gui/file/*` 等复杂 Shadow DOM 宿主页面不显示问题（改进 `document.caretRangeFromPoint` 兜底 + 选择事件监听）
- Popup `index.html`：关闭 Vite `modulePreload` 自动注入，消除 "cross-world extension resource mismatch" 警告（MV3 popup 与 content script 共享 chunk 场景）
- 情报面板：移除 bazaar、joesandbox 两个用户要求删除的情报源；INTEL_SOURCES 表现在为 12 家（前 10 家在各面板默认展示）
- 正则面板测试文本框：修复白底黄字与背景色叠加导致的"重影"视觉问题（调整 Tailwind 透明度和 textarea background-clip）
- 网络面板 IP 归属：修复 xdb 文件 fetch 路径（data/ip2region.db 正确落到 dist/，相对路径改为 Vite 打包后的 `/data/ip2region.db`），解决 "FETCH_FAILED HTTP 404"

## 0.1.1 (2026-08-08)

### Fixed
- 右键菜单：分组标题不可见（`type: separator` 会忽略 title），改用 `enabled: false` 的普通菜单项显示分组标签
- 右键菜单：添加 `chrome.runtime.onStartup` 监听，确保浏览器重启后菜单仍可正常注册

## 0.1.0 (2026-08-08)

### Added
- 编解码：Base64/Base32/Hex/URL/Unicode/HTML 实体编解码
- 编解码：JWT Token 解析
- 编解码：多层自动解码引擎
- 加密哈希：MD5/SHA1/SHA256/SHA512 哈希计算
- 加密哈希：HMAC 消息认证
- 加密哈希：AES 加解密（CBC/ECB/GCM/CTR）
- 格式化：JSON 格式化/压缩/校验/转义/Path/Diff
- 格式化：Python/SQL/XML 格式化
- 时间转换：Unix 时间戳 ↔ 可读时间
- 时间转换：FILETIME 转换
- 时间转换：当前时间实时显示
- 进制转换：多进制互转及 Hex 查看器
- 生成器：UUID 生成（支持批量、大小写）
- 生成器：强随机密码（可选字符类型与排除易混淆字符）
- 生成器：随机字符串（字母/数字/十六进制/全字符集）
- 生成器：随机整数（指定闭区间，无偏采样）
- 生成器：随机字节（十六进制输出）
- 设置面板：主题模式（跟随系统/亮色/暗色）
- 设置面板：自动复制结果、最大解码层数等
- 版本更新检测与通知

### Changed
- 所有面板输入时自动运行，移除执行按钮，复制按钮保留
- 格式化面板输入输出区域等大（Diff 模式除外）
- 时间戳转换新增 `YYYY-MM-DD HH:mm:ss` 格式输出
- Base64 解码直接返回纯文本结果
