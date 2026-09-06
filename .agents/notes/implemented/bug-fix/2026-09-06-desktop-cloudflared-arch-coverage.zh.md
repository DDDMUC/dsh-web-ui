# Agent Note: Desktop payload carries every shipped OS's cloudflared binary

Status: implemented

## Problem

桌面载荷的 `cloudflared` 依赖只在构建机平台上安装 postinstall 二进制。staged profile 树因此给 Windows 安装包也带上了 macOS arm64 的 `bin/cloudflared`：在 Windows 上包找的是 `bin/cloudflared.exe`（缺失，隧道只能先按需下载再用），而在 macOS x64 上隧道插件的「存在即跳过」检查信任了错误架构的 Mach-O，隧道启动直接失败且没有自愈路径。两个方向都是在发布管线的 Windows 兼容性审查中暴露的。

## Decision

两个互补修复，各补缺口的一侧：

- **构建期（桌面载荷）**：`desktop/scripts/build-runtime.mjs` 从 cloudflared GitHub release（latest 渠道，与包自身 postinstall 相同）把 `cloudflared-windows-amd64.exe` 拉取到 staged profile 树的 `bin/cloudflared.exe` ——包在 win32 上原生解析的名字——并做 MZ/PE 头完整性检查。`assertRuntimeEntrypoints` 与 afterPack 钩子都断言该二进制到达打包产物。
- **运行时（隧道插件）**：`packages/dsh-remote-web-ui/src/tunnel.ts` 的默认二进制就绪策略不再盲信「文件存在」：先用 10 秒封顶的 `--version` 子进程探测（`createBinaryReadiness` 内按进程缓存结果），探测失败时通过 cloudflared 包的 `install()` 重装当前平台二进制；重装后仍不能运行则抛出可诊断的错误。这覆盖 macOS x64（错误架构的 staged 二进制在首次隧道启动时重新拉取）以及任何损坏/过期二进制。

## Alternatives considered

- 按架构后缀名 stage 多份二进制并让插件按名解析：每个发布目标都能首用即用，但要发明 cloudflared 包没有的解析词汇；而且隧道本身就需要网络，按需重取只花首次的一次下载。
- 用 cloudflared 包自带的 `install_windows()` 出 Windows 二进制：否决——它按构建机的 `process.arch` 选资产，macos-latest runner 是 arm64 且没有对应的 Windows 资产；直接拉取已知的 amd64 资产名更简单。
- 用读 Mach-O/PE 头代替 spawn 校验：更便宜，但要复刻各 OS 的二进制格式知识；`--version` spawn 检验的正是要紧的性质（操作系统能执行它）。

## Consequences

- Windows 隧道开箱即用；macOS x64 在首次隧道启动时自愈（一次网络拉取，写入用户可写的 `~/.dsh` profile 树）。
- 每次桌面构建多拉一个约 20 MB 的二进制；Windows 安装包同时会带着 postinstall staged 的 darwin `bin/cloudflared`（按 target 裁剪留作后续优化，需实测尺寸再议）。
- staged exe 在构建时随 `latest` 渠道浮动，与包自身 postinstall 的二进制一致。

## Testing

- `packages/dsh-remote-web-ui` vitest：新增四例覆盖「跳过并缓存」「错误架构重装」「缺失时下载且重装仍失败要响亮报错」以及真实 `binaryRuns` 探测（node 可运行、不存在的路径不可运行）；插件全量 347 项测试通过。
- 本地 `node scripts/build-runtime.mjs` staged 出 `cloudflared.exe`（`file` 验证为 PE32+ x86-64）并通过新断言；`npx electron-builder --win dir --x64` 把它打进 `dist/win-unpacked/resources/runtime/profile-web/node_modules/cloudflared/bin/`，afterPack 断言被真实执行。
