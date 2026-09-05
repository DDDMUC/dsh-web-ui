# Agent Note: 桌面版内置 pnpm（以及可用的 npm）

Status: implemented

## Problem

桌面版内置运行时此前只带 Node 加宿主与 profile 载荷，没有 pnpm，因此在没有预装任何工具的机器上，应用内走 pnpm 的插件流程（`dsh plugin add/remove`）会报「pnpm not found on PATH」——这是[Electron 桌面版](../../architecture/2026-09-03-electron-desktop-app.zh.md)记录在案的已知限制。产品标准是一台没有装任何编程环境的电脑也能完整使用桌面版，而插件管理是核心流程（Workshop 插件安装与社区插件接入都要经过它）。

接入 pnpm 的验证过程还暴露出第二个既有的缺陷：暂存 Node 发行版的 `bin/npm` 与 `bin/npx` 是指向已被删除的解包临时目录的悬空符号链接，内置 npm 从来无法启动——对任何会 shell 出去调 npm 的流程，「零预装工具」的承诺早已不成立。

## Decision

**`desktop/scripts/fetch-pnpm.mjs` 把 pnpm 装进每个内置 Node 发行版。** 一个锁定版本（11.24.0——仓库工具链版本，保证 lockfileVersion 与 workspace 设置和构建暂存载荷时一致）从 npm registry 下载一次，按元数据的 `dist.integrity` sha512 校验，解包后以各平台 npm 全局安装布局拷入三份暂存发行版（`node-mac-arm64`、`node-mac-x64`、`node-win-x64`）：macOS 为 `lib/node_modules/pnpm` 加 `bin/` shim，Windows 为 `node_modules/pnpm` 加根目录 `.cmd` 与 sh shim。shim 用相对路径解析 `pnpm.cjs`、经 PATH 解析 `node`，因此在 electron-builder 重定位发行目录后依然有效。这与宿主的 spawn 契约兼容：`dsh plugin` 在 Windows 上以 `shell: true` 启动 pnpm（`.cmd` shim 是必要且充分的形态），在 macOS 上无 shell 启动（sh shim 经 PATH 解析，而应用会把内置 `bin/` 前置到 PATH）。`.pnpm-version` 标记让重跑幂等，对应 `fetch-node.mjs` 的 `.node-version`。

**`fetch-node.mjs` 原样保留符号链接，并断言链接留在发行目录内。** 官方 tarball 只有发行目录内的相对链接（`bin/npm -> ../lib/node_modules/npm/bin/npm-cli.js`），重定位后仍然有效；原来的 `fs.cpSync(..., { dereference: true })` 会把相对目标改写成指向已删除临时目录的绝对路径（Node 25 实测——`dereference: true` 既不真正解引用也不保留相对目标）。现在暂存后（跳过路径同样）遍历发行目录，任何逃出发行根目录或悬空的符号链接都会让构建失败。

**工具链在每一层都有断言与冒烟验证。** `build-runtime.mjs` 要求三份暂存载荷里都有 `npm`/`pnpm` 入口（与 `node` 并列）；`after-pack.cjs` 要求它们存在于打包产物内；`desktop-release.yml` 新增冒烟步骤，把暂存的 `node-mac-arm64/bin` 前置到 PATH，在构建安装包之前直接从载荷内运行 `node --version`、`npm --version`、`pnpm --version`。Windows 载荷只做存在性检查——macOS runner 上无法执行。

`desktop/README.md` / `README.zh.md` 移除 pnpm 已知限制，并补充内置工具链的说明。

## Testing

- 本地从零重新暂存（`fetch-node.mjs` + `fetch-pnpm.mjs`），以暂存的 `node-mac-arm64/bin` 前置 PATH 后：`node --version` → v24.20.0，`npm --version` → 11.19.0（解析到内置发行版内部；此前因悬空链接解析到 homebrew 的 npm），`pnpm --version` → 11.24.0。
- 在隔离的临时 `DSH_HOME`、以内置工具链前置 PATH 走用户完整流程：`dsh plugin --profile smoke add @linxin666/dsh-doctor` 初始化 profile 并经内置 pnpm 11.24.0 以退出码 0 完成。
- CI：desktop-release 工作流的冒烟步骤在每次 tag 构建时对暂存载荷运行同样的三条命令。

## Alternatives considered

- **构建机上用内置 npm 对每个目标执行 `npm install -g pnpm`**：能顺带验证 npm 本身，但只有两个 macOS 目标可执行——Windows 发行版无法在 macOS runner 上运行，终究要再引入一套手工机制；统一的单一代码路径取代了这对组合。
- **pnpm 独立可执行文件（`@pnpm/exe` 平台包）**：Windows 的真实 `.exe` 是 spawn 兼容性最好的形态，但每个二进制比 npm 包重数十 MB，且布局缺乏 npm 对等性；宿主在 Windows 上本就以 `shell: true` 启动，`.cmd` shim 并不是负担。
- **Corepack（`corepack enable` + 预取 pnpm）**：corepack 的缓存在发行目录之外，首次使用时的下载路径依赖运行期 registry 健康状况；与离线/零配置的前提相悖。
- **首次启动在线安装 pnpm**：与父 Note 拒绝「首次运行在线安装运行时」的理由相同——首次启动不得依赖网络或 registry 健康状况。

## Consequences

- 每个交付目标的安装包增大约 pnpm 包体积（约 12 MB）；相对载荷本就数百 MB 的体量，可以接受。
- 锁定的 pnpm 版本是新的受控事实：升级意味着修改 `fetch-pnpm.mjs`（必须停留在仓库工具链与暂存 lockfile 所在的 pnpm 11 线）。
- 应用内 `dsh plugin` 流程现在在零预装工具的机器上可用；父 Note 的已知限制退役，其中的后果描述已同步更正。
- shim 契约依赖宿主的两个事实：应用把内置 Node `bin/`（或根目录）前置到宿主子进程的 PATH，且宿主在 Windows 上经 shell 启动 pnpm。任一变化时，需要回头审视 `fetch-pnpm.mjs` 的布局。
