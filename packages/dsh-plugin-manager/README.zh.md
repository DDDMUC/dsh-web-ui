# @linxin666/dsh-client-ui-plugin-manager

[English](README.md) | 中文

面向 dsh web GUI「插件」设置分区的插件管理器 Tab：从 npm 或 git 安装插件，列出已装插件并提供下次启动生效的启用开关，如实呈现安装时冲突动作并支持撤销，失败一键转交修复会话。

## 功能

- 在官方「插件」设置分区注册「插件管理」Tab（`settings.plugins.tab` 槽位，order 20，与官方安装器 Tab 并列）。
- 双通道传输：带官方安装器服务的运行时（DSHCode 与 1.0.4 checkout 版 web）走官方 `/plugin-installer`、`/plugin-control` loopback RPC 通道；npm 发布的官方 web 没有这些通道，本包的 host 半区挂载 loopback 门禁的 HTTP 网关——安装/卸载 spawn 官方 `dsh plugin` CLI（唯一写入器），启停写入 `disabled` 覆盖行。
- 从 npm 包名或 git 仓库 URL 安装插件，带进度。
- 列出已装用户插件：下次启动生效的启用开关、更新检查（npm 源走 registry）、更新与卸载。
- 官方 plugin-control 面存在时展示内置产品开关。
- 安装时冲突对账：官方模式对产品快照前后 diff；网关模式对每次 CLI 运行前后的 profile 层 diff，可撤销的动作给一键撤销，每条冲突都给「让 Agent 修复」转交。
- 按插件渲染启动失败环：「让 Agent 修复」（以插件安装根为工作区的修复会话）与「复制错误」；npm web 运行时没有失败环，只有安装错误提供修复转交。
- 显示宿主安全模式横幅与「恢复正常模式」操作（web 端在下次手动重启时生效）。
- npm 运行时保护下次启动：安装后网关用 CLI 的 `--dump-config` 做组合预检，并检测重复入口 id 认领；预检失败或重复认领的插件会被自动禁用，错误行带修复转交，保证下次启动不炸。

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

本 Tab 不携带配置命名空间。开关与安装在下次重启后生效。

## 已知限制

- 仅限本机：LAN 或远程浏览器只显示「仅限本机操作」提示（与官方安装器 Tab 同一边界；网关对非 loopback 请求返回 403）。
- npm 发布的官方 web 上，网关写入经官方 CLI 执行，因此 host 进程 PATH 里必须有 `dsh`；git 源安装可能耗时数分钟，以后台任务运行。
- npm 发布的官方 web 没有启动失败环与安全模式：这两处界面降级为空，只有安装错误提供修复转交。
- npm 运行时上的启停会在 profile 的 cordis.patch.yml 写入裸 `disabled` 覆盖行；该运行时 loader 在下次启动时认读这些行，但这条路径不如官方桌面写入器经过充分锻炼。
- web 端无壳内重启：变更在下次手动重启后生效。
- 安装时冲突检测报告安装实际改了什么（官方模式为产品行；网关模式为 profile 行与 bundle 条目）。npm 运行时上重复 insert id 认领在安装后即被检出并自动禁用新插件；官方运行时由官方规则与失败环处置该类冲突。
- npm 运行时的启动预检（`--dump-config`）能抓组合失败，例如只提交 src/ 没有 lib/ 构建产物的包；真正的运行时 apply 失败仍要到下次启动才暴露，官方运行时靠失败环呈现，npm 运行时没有失败环。
- wire 形状镜像官方安装器 Tab 协议；漂移时宽容解析器降级为错误行，不误操作。
- 修复会话工作区保留路径派生的默认标题。

## 许可证

BSD-3-Clause。
