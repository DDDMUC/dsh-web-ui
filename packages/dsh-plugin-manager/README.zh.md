# @linxin666/dsh-client-ui-plugin-manager

[English](README.md) | 中文

面向 dsh web GUI「插件」设置分区的插件管理器 Tab：经官方 host 通道从 npm 或 git 安装插件，列出已装插件并提供下次启动生效的启用开关，如实呈现安装时冲突动作并支持一键撤销，失败一键转交修复会话。

## 功能

- 在官方「插件」设置分区注册「插件管理」Tab（`settings.plugins.tab` 槽位，order 20，与官方安装器 Tab 并列）。
- 通过官方 host 安装通道从 npm 包名或 git 仓库 URL 安装插件；本包自己不写任何 profile patch 行（单一写入器纪律）。
- 列出已装用户插件：下次启动生效的启用开关、更新检查、更新与卸载。
- 展示内置产品开关（官方 plugin-control 面）。
- 安装时冲突对账：围绕每次安装对产品快照做前后 diff，如实呈现冲突规则禁用了什么，并给一键撤销。
- 按插件渲染启动失败环：「让 Agent 修复」（以插件安装根为工作区的修复会话）与「复制错误」。
- 显示宿主安全模式横幅与「恢复正常模式」操作（web 端在下次手动重启时生效）。

## 安装

### 从 npm 安装（推荐）

```sh
dsh plugin --profile web add @linxin666/dsh-client-ui-plugin-manager
```

### 从仓库安装（开发调试）

```sh
git clone https://github.com/zhu1090093659/dsh-web-ui.git
cd dsh-web-ui
pnpm install && pnpm -r build
dsh plugin --profile web add link:$(pwd)/packages/dsh-plugin-manager
```

重启 `dsh web` 后，设置页「插件」分区出现该 Tab。

## 配置

本 Tab 不携带配置命名空间。所有操作经官方 host 通道（`/plugin-installer`、`/plugin-control`，loopback 权威）执行——这些通道由 web 组合默认挂载；开关与安装在下次重启后生效。

## 已知限制

- 仅限本机：LAN 或远程浏览器只显示「仅限本机操作」提示（与官方安装器 Tab 同一边界）。
- 依赖官方「插件」设置分区（`ui-settings-plugins`）与 host 的 `plugin-installer` / `plugin-control` 行；缺失时 Tab 显示错误态、不提供安装能力。
- web 端无壳内重启：变更在下次手动重启 `dsh web` 后生效；安全模式启动是桌面专属，本 Tab 只能读取横幅并退出安全模式。
- 安装时冲突检测覆盖内置产品规则（产品快照 diff）。两个用户插件之间的重复 insert id 认领在安装时无信号，重启后经启动失败环呈现。
- wire 形状镜像官方安装器 Tab 协议；漂移时宽容解析器降级为错误行，不误操作。
- 修复会话工作区保留路径派生的默认标题。

## 许可证

BSD-3-Clause。
