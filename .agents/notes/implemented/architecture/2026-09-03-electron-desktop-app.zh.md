# Agent Note: Electron 桌面版与内置自洽 dsh 运行时

Status: implemented

部分被取代（2026-09-03，见[桌面版独立宿主与保留端口](../bug-fix/2026-09-03-desktop-separate-host-reserved-ports.zh.md)）：3080 移交设计与无约束的空闲端口选取已移除——应用现在始终启动自己的宿主，使用绝不占用 3080/3081 的专用端口段。

## Problem

dsh-web 以插件包形态分发，前提是一套可用的 dsh 环境：Node 22+、npm 全局安装的 `@deepseek-ai/dsh` 宿主、初始化好的 `~/.dsh`，以及装好插件的 web profile。这是开发者工具链，不能要求非技术用户自行搭建。[desktop-launcher 插件](../bug-fix/2026-08-29-desktop-launcher-browser-launch.zh.md) 只是为「已安装的 `dsh web`」创建桌面快捷方式，并不消除环境要求（该插件其后已彻底移除，见[移除笔记](../simplification/2026-09-03-remove-dsh-desktop-launcher.zh.md)）。目标是做出一个人人可安装、双击即用、完全不用关心环境的桌面版。

## Decision

仓库新增顶层 `desktop/` 目录（不在 pnpm workspace glob 内），承载一个用 electron-builder 构建的 Electron 应用，目标平台为 macOS（dmg/zip，arm64+x64）与 Windows（nsis/zip，x64），内部分发不签名。

**运行时一律内置，绝不假设。** 安装包携带：每个目标平台的官方 Node.js 发行版（构建时按 SHASUMS256.txt 校验 sha256，`resources/runtime/node-<os>-<cpu>/`）、锁定版本的 `@deepseek-ai/dsh` 宿主及其依赖闭包（`runtime/host/`），以及一个预装好的 web profile——bundle 为 `dsh-base` + `dsh-web-app` + `@linxin666/dsh-web-all`（`runtime/profile-web/`）。启动时 Electron 主进程以子进程方式拉起 `<内置 node> <内置宿主>/lib/bin.js web --no-open --host 127.0.0.1 --port <空闲端口>`，待 GUI 就绪后加载宿主在 stdout 打印的带 token URL（认证门每次进程启动签发一次性 token，在应用窗口内换取签名会话 cookie）。

**一次安装覆盖多平台载荷。** 两棵运行时树都用 pnpm `nodeLinker: hoisted` 加 `supportedArchitectures`（darwin/win32 × x64/arm64）安装，使 sharp、lightningcss 等按平台解析的可选依赖覆盖全部目标，落进同一棵无符号链接的真实文件树——无符号链接是硬性要求，因为安装器与 `fs.cp` 都无法保留 pnpm 的链接布局。`build-runtime.mjs` 断言暂存树内不存在符号链接。

**`~/.dsh` 与 CLI 共享，不做隔离。** 应用解析 DSH_HOME 的顺序与宿主完全一致（`$DSH_HOME` 优先，否则 `~/.dsh`）。web profile 仅在缺失时播种；由本应用播种的 profile 带 `.dsh-desktop-seed.json` 标记，内置运行时戳变化时重新播种，且保留用户的 `cordis.patch.yml` 层；无标记的 profile 视为用户自管，永不触碰。宿主自身的启动期修复（`$DSH_HOME/profiles/node_modules` 回退链接）让 profile 内的插件代码复用宿主的 `@deepseek-ai/*` 模块实例，因此即使 profile 自身不携带任何 `@deepseek-ai/*` 副本，也不存在 cohort 重复。

**移交而非双宿主.** 默认 URL 已有 GUI 应答时，应用把该 URL 交给系统浏览器打开（用户浏览器的 cookie 已持有会话）并退出，而不是在同一个 `$DSH_HOME` 上再起一个 web 宿主。 内嵌已运行实例也不可行：认证门每次进程启动签发一次性 token，本应用无法事后获取；且 Electron 窗口有独立的空 cookie jar，附着只会永久 401。 当应用自己启动宿主时，它拥有该子进程并在退出时停止它（POSIX 进程组 SIGTERM，5 秒后 SIGKILL 兜底；Windows 用 `taskkill /T`）。

## Alternatives considered

- **在 Electron 主进程内直接运行 dsh 宿主**（复用 Electron 内嵌 Node）：包体更小，但 dsh 的进程派生、插件加载器与文件系统假设将运行在 Electron 打过补丁的 Node 上，故障都要自己排。内置官方 Node 让宿主字节级等同插件测试所基于的 npm 安装拓扑。
- **用 `ELECTRON_RUN_AS_NODE=1` 派生子进程**（把 Electron 二进制当纯 Node）：仍是子进程，但 Node 版本被 Electron 发行版钉死，考察过的版本不满足宿主的 `^22.19 || >=24` 引擎区间，且宿主依旧跑在 Electron 补丁版 Node 上。
- **首启在线安装**（应用做小，首次启动跑 `dsh plugin add`）：违背「安装即用」承诺，离线即失败，首启依赖 npm registry 可用性，且内置运行时里没有 pnpm。
- **隔离 App 专属 DSH_HOME**（Application Support）：卸载更干净，但同时使用 dsh CLI 的用户会得到两套互不相通的配置；共享 `~/.dsh` 加标记制归属既保持单一事实源又不破坏既有数据。
- **扩展 desktop-launcher 插件**而非新建应用：该插件的前提是「dsh 已安装」，桌面版的前提恰恰相反。2026-09-03 起被取代：插件已彻底移除，本桌面应用是唯一的桌面路径（见[移除笔记](../simplification/2026-09-03-remove-dsh-desktop-launcher.zh.md)）。

## Consequences

- 安装包体积大（数百 MB）：Node 发行版加两份依赖闭包，且可选依赖覆盖四个目标平台。内部分发可接受；裁剪（去掉 darwin-x64 或未用 bundle）留作后续优化，须有实测体积依据。
- 内置 `cloudflared` 只拉取构建机平台的二进制，远程隧道插件在构建平台上开箱可用，其他平台按需拉取；已记入 `desktop/README.zh.md` 已知限制。
- 依赖 pnpm 的应用内插件安装不可用（内置运行时无 pnpm）；Workshop 资产安装不受影响。
- 宿主或插件全家桶的版本升级 = 修改 `desktop/runtime/*/package.json` 的锁定版本并重跑 `npm run prepare-runtime`；运行时戳驱动用户机器上的自动重新播种。
- 未签名构建会触发 Gatekeeper / SmartScreen 提示；签名、公证与自动更新是明确的后续工作，不在本期范围。

## Testing

- `desktop/tests/runtime.test.mjs`（node --test）覆盖路径解析、DSH_HOME 查找顺序、seed/reseed/leave 判定与重新播种时的补丁层保留。
- 实机验证：用临时 DSH_HOME 直接启动暂存宿主并探测 GUI；以隔离 DSH_HOME 运行打包产物；证据记录于引入本 Note 的变更交付报告中。
