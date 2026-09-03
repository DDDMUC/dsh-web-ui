# Agent Note: desktop app runs its own host on a reserved-port-free range

Status: implemented

部分取代 [Electron 桌面应用笔记](../architecture/2026-09-03-electron-desktop-app.zh.md)：3080 移交设计与无约束的空闲端口选取已移除。同时记录首次完整的打包链路实测——它发现并修复了一条断裂的运行时载荷链。

## Problem

桌面应用在启动时探测 `http://127.0.0.1:3080`，一旦有应答就把该 URL 交给系统浏览器。在标准机器上——即已经有一个 `dsh web` 跑在 3080 的机器——应用永远起不了自己的宿主，退化成一个书签。端口选取是无约束的系统分配空闲端口，「绝不占用用户自己的 3080/3081」只是统计上的巧合。

打包链路此前从未端到端跑过，实测暴露了四个缺陷：暂存的 Node 目录叫 `node-darwin-*`/`node-win32-*`，而 electron-builder 的 `${os}` 宏展开为 `mac`/`win`，extraResources 因此找不到 Node 载荷（且只告警）；`dist:mac` 只构建当前架构，与文档宣称的双架构矩阵不符；打包产物静默丢失两份载荷的 `node_modules` 树（见下）；`VERSION.json` 从未进包，打包版的 reseed 指纹永远是 `unknown`。

## Decision

桌面应用始终启动自己的独立宿主并全权掌握其生命周期：

- 移除 3080 附着/移交路径及其 `DSH_DESKTOP_NO_ATTACH` 逃生开关。`findHostPort()` 优先服务专用回环端口段 3082-3181（跨启动地址稳定），段满回退系统分配端口；3080/3081 在两条路径上都被契约排除，并有绑定真实套接字的单元测试。
- 暂存载荷命名统一为 electron-builder 的 `${os}` 拼写（`node-mac-*`、`node-win-*`），`build-runtime.mjs` 在暂存后断言每个发布载荷的入口二进制存在。
- 运行时载荷改由 `afterPack` 钩子（`scripts/after-pack.cjs`）拷贝，不再走 `extraResources`：electron-builder 在 files 与 extraResources 匹配器之间共享排除模式，app 目录的 node_modules 排除会静默丢掉两份载荷树，而缺失的 extraResources 源只产生告警。钩子拷贝 host、profile-web、按架构的 Node 发行版和 `VERSION.json`，并对目标侧每个入口点做强断言。
- `dist:mac` / `dist:win` 显式固定 `--arm64 --x64` / `--x64` 架构旗标，让文档宣称的产物矩阵成为实际构建内容。

## Testing

- `node --test`（11 个测试）：端口契约——保留集合恰为 3080/3081，`findHostPort` 服务专用端口段、跳过被占用端口、返回可立即绑定的端口。
- 隔离 `DSH_HOME` 的 dev 实机运行：profile 带标记播种，宿主落在 127.0.0.1:3082，裸 URL 401、token URL 完成 cookie 交换后 200，用户真实 3080/3081 实例全程 pid 不变且正常应答，对应用 SIGTERM 后宿主与端口一并释放。
- 打包实机运行（arm64 `.app`）：同一组断言全部通过；应用干净退出并释放端口。
- 两套 `dmg`/`zip` 产物（arm64 + x64）经 zip 清单验证：完整 host 闭包（27180 项）、Node 二进制与 `VERSION.json` 均在。

## Consequences

同一个 `~/.dsh` 上双宿主并存自此是设计内模式：CLI 实例守 3080/3081，桌面实例取 3082+，两个 GUI 各自持有独立会话。

下文记录为未决的 doctor 守护进程发现已于次日解决：supervisor 现以宿主受管子进程运行，不再注册任何 OS 服务——见 [dsh-doctor 受管子进程](../architecture/2026-09-04-dsh-doctor-bounded-supervisor.zh.md)。

未决发现（当时上报，待产品决策）：每次 dsh 宿主启动都会部署 dsh-doctor 用户服务（`service-install` 写入 `~/Library/LaunchAgents/com.dsh.doctor.plist`，带 `KeepAlive` + `RunAtLoad`），指向该次启动自己的安装路径。该守护进程由 launchd 所有，超出任何进程组清理的射程；且 plist 是全局状态，任何一次启动都会劫持它——本次验证期间它先后被桌面 dev 运行和另一个并发自动化的 e2e 实例改写，每次都通过真实 profile 的 `service-install` 恢复。候选方案：在桌面 profile 种子中禁用 doctor 行、应用退出时执行 `service-uninstall`，或接受一个常驻后台守护进程。
