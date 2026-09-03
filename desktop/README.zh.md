# desktop — DeepSeek Harness 桌面版

[English](README.md) | 中文

一个把 DeepSeek Harness Web GUI 变成可安装桌面应用（macOS / Windows）的 Electron 壳。安装包内置独立的 Node.js 运行时、dsh 宿主和预装好的 web profile（官方 web bundle + dsh-web 插件全家桶），因此开箱即用——不需要预装 Node、npm 或 dsh CLI。

## 功能

- 双击启动：当 `~/.dsh/profiles/web` 缺失时用内置 profile 种子初始化，用内置 Node 运行时在专用回环端口启动自己的 dsh 宿主，等 GUI 就绪后加载宿主打印的带 token URL（认证门每次进程启动签发一次性 token；会话 cookie 保存在应用窗口内）。
- 独立宿主、端口有保证：应用始终运行自己的内置宿主——不会附着到已有 GUI，也绝不占用原生 `dsh web` CLI 默认端口 3080/3081。优先使用专用端口段 3082-3181（跨启动地址稳定），段满时回退到系统分配端口。桌面实例与你自己的 `dsh web` 并存运行，各自持有独立的 GUI 会话。
- 与已有 dsh 安装共享 `~/.dsh`：由本应用播种的 profile 带 `.dsh-desktop-seed.json` 标记，内置运行时版本变化时会被重新播种；没有该标记的 profile 视为用户自管，永不触碰。用户的 `cordis.patch.yml` 层在重新播种后保留。
- 单实例：第二次启动只会聚焦已有窗口。关闭窗口即退出应用，并优雅停止由它启动的宿主（POSIX 进程组 SIGTERM，Windows 用 `taskkill /T`，5 秒后强杀）。
- 启动失败（载荷缺失、宿主在就绪前退出、就绪超时）会进入错误页，展示宿主日志尾部，提供「重试」和「打开日志文件」按钮。完整宿主日志在 Electron `logs` 目录（`dsh-host.log`）。

## 仓库布局

| 路径 | 内容 |
| --- | --- |
| `src/` | Electron 主进程（`main.cjs`）、可测试的纯函数模块（`runtime.cjs`）、preload、启动页与错误页 |
| `runtime/host/` | 锁定版本的 `@deepseek-ai/dsh` 清单 + pnpm 布局（hoisted、多平台） |
| `runtime/profile-web/` | web profile 种子清单：bundle 为 `dsh-base` + `dsh-web-app` + `@linxin666/dsh-web-all` |
| `scripts/fetch-node.mjs` | 下载并校验 sha256 的内置 Node 发行版（`resources/runtime/node-<os>-<cpu>/`） |
| `scripts/build-runtime.mjs` | 用 pnpm 安装两份载荷并暂存到 `resources/runtime/` |
| `scripts/after-pack.cjs` | 打包后把暂存载荷拷进应用（electron-builder 的 extraResources 会静默丢弃载荷的 node_modules） |
| `resources/` | 应用图标 + 生成的运行时载荷（git 忽略） |

## 构建

### 前提

构建机需要 Node 22+ 与 pnpm 11（仓库工具链）。打包出来的应用本身没有任何环境要求。

### 步骤

```sh
cd desktop
npm install            # electron + electron-builder
npm run prepare-runtime  # 下载 Node 发行版 + 安装并暂存载荷
npm run dist:mac         # dist/*.dmg + *.zip（arm64 + x64）
npm run dist:win         # dist/*.exe（nsis）+ *.zip（可从 macOS 交叉构建）
```

`npm start` 基于已暂存的 `resources/runtime/` 以未打包形态运行应用，供开发调试。

## 配置

| 环境变量 | 默认值 | 含义 |
| --- | --- | --- |
| `DSH_HOME` | `~/.dsh` | 与 dsh CLI 共享的数据目录（配置、会话、密钥）。仅在隔离测试时设置。 |

内置版本锁定在 `runtime/host/package.json`（`@deepseek-ai/dsh`）与 `runtime/profile-web/package.json`（`@linxin666/dsh-web-all`），构建时记录进 `resources/runtime/VERSION.json`。

## 安全模型

- dsh 宿主只绑定回环地址（`127.0.0.1`）；`--host 0.0.0.0` 会被宿主自身拒绝。
- 窗口无 Node 集成，preload 运行在沙箱中；导航被限制在回环地址（以及本地启动页/错误页），外部链接一律交给系统浏览器打开。
- 内置 Node 发行版在构建时按官方 SHASUMS256.txt 校验。
- 应用只会写入启动时解析出的 `$DSH_HOME`、Electron `logs` 目录和它自己的安装目录。

## 已知限制

- **未签名构建**：macOS 首次打开会有 Gatekeeper 警告（右键 → 打开，或 `xattr -dr com.apple.quarantine`）；Windows 有 SmartScreen 提示（更多信息 → 仍要运行）。签名与公证是后续计划。
- **需要 pnpm 的应用内插件安装**（如 `dsh plugin add` 流程）在内置环境中不可用；Workshop 的皮肤/资产安装是纯文件拷贝，不受影响。
- **远程隧道（`dsh-remote-web-ui`）**：`cloudflared` 二进制只会拉取构建机平台的版本，因此隧道在 macOS arm64 上开箱可用，其他平台按需拉取。
- **Windows arm64 与 Linux** 暂不构建；运行时布局已支持后续加入。
- 全新机器首次启动会花几秒钟把预装 profile 拷贝进 `~/.dsh`（一次性）。
- **同一个 `~/.dsh` 上的两个宿主**：桌面应用与你自己的 `dsh web` 同时运行时，两个 dsh 宿主进程共享同一数据目录。这种并存是设计内模式——桌面应用不读取也不操控你的实例，两个 GUI 各自持有独立会话。
