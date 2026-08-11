# dsh-web-ui · DSH Web GUI 插件全家桶

中文 | [English](#english)

本仓库是 DeepSeek Harness Web GUI 的插件全家桶 monorepo（由原「皮肤集合」升级而来）：多个原本独立的 web GUI 插件仓库已迁入 `packages/`，每个插件仍是官方标准 bundle（`dsh.bundle.patch` 清单 + `cordis.patch.yml` 插件行），可独立安装；同时提供聚合插件包（web-ui-all / dsh-skins）一键装齐。

> 本仓库属于 `dsh-external` 组织，仅组织成员可见（private）。请勿提交任何凭据、密钥或内部敏感信息。

## 目录结构

```text
dsh-web-ui/
├── packages/
│   ├── task-board/        @deepseek-ai/dsh-client-ui-task-board      任务看板
│   ├── git-graph/         @deepseek-ai/dsh-client-ui-git-graph       Git 分支/图谱
│   ├── pet/               @deepseek-ai/dsh-pet                       鲸鱼娘宠物
│   ├── remote-web-ui/     @deepseek-ai/dsh-remote-web-ui             手机远程控制
│   ├── working-activity/  @deepseek-ai/dsh-working-activity          工作状态行
│   ├── code-kline/        @deepseek-ai/dsh-code-kline                 代码工作量 K 线（host）
│   ├── ui-code-kline/     @deepseek-ai/dsh-client-ui-code-kline       代码工作量 K 线（client）
│   ├── live-stats/        @deepseek-ai/dsh-live-stats                 实时 token 估算与吞吐
│   ├── skins/             皮肤集合（qq98/ths/xp/blue-fantasy/dragon-heir/skin-center/web）
│   ├── dsh-skins/         @deepseek-ai/dsh-skins      皮肤聚合插件（装它 = 全部皮肤包 + 皮肤中心）
│   └── web-ui-all/        @deepseek-ai/dsh-web-ui-all  全家桶聚合插件（装它 = 全部功能插件 + 皮肤全家桶）
├── gallery/               皮肤试穿预览页
└── scripts/               构建与脚手架（dsh-skin / dsh-skin-new / dsh-plugin-new / aggregate.mjs 等）
```

## 快速安装

前提：DSH 支持 profile/bundle 机制（`dsh plugin` 命令存在）。以下命令中 `<dsh-web-ui>` 为本仓库路径占位。

### 聚合安装（一键装齐）

```sh
# 全部功能插件 + 皮肤全家桶
dsh plugin --profile web add link:<dsh-web-ui>/packages/web-ui-all

# 仅皮肤全家桶（全部皮肤包 + 皮肤中心）
dsh plugin --profile web add link:<dsh-web-ui>/packages/dsh-skins

# 本机 loader 解析层（~/.dsh/profiles/node_modules/@deepseek-ai）
# 建立/刷新全家桶链接，幂等可重复运行
node scripts/link-profile.mjs
```

### 独立安装

```sh
# 开发模式（link 到本仓库）
dsh plugin --profile web add link:<dsh-web-ui>/packages/task-board

# 未来发布（GitHub 安装）
dsh plugin --profile web add github:dsh-external/dsh-task-board
```

### 皮肤启用

皮肤启用互斥由 `~/.dsh/cordis.patch.yml` managed 区段维护，切换即时生效：

```sh
dsh-skin use blue-fantasy   # 或 qq98 / ths / xp / dragon-heir
```

> 皮肤需先安装（聚合包，或 `dsh plugin --profile web add link:<dsh-web-ui>/packages/skins/<skin>`）才能切换。

## 插件列表

| 包名 | 功能 | 独立安装命令 |
| --- | --- | --- |
| @deepseek-ai/dsh-client-ui-task-board | 任务看板：侧边栏入口 + 多列看板，本地持久化，可真实驱动 agent 会话，支持 5 段 cron 定时 | `dsh plugin --profile web add link:<dsh-web-ui>/packages/task-board` |
| @deepseek-ai/dsh-client-ui-git-graph | Git 分支 / 图谱可视化 | `dsh plugin --profile web add link:<dsh-web-ui>/packages/git-graph` |
| @deepseek-ai/dsh-pet | 鲸鱼娘宠物挂件 | `dsh plugin --profile web add link:<dsh-web-ui>/packages/pet` |
| @deepseek-ai/dsh-remote-web-ui | 手机远程控制 Web GUI | `dsh plugin --profile web add link:<dsh-web-ui>/packages/remote-web-ui` |
| @deepseek-ai/dsh-working-activity | 工作状态行：模型实时活动（思考 / 工具 / 回合摘要） | `dsh plugin --profile web add link:<dsh-web-ui>/packages/working-activity` |
| @deepseek-ai/dsh-code-kline | 代码工作量 K 线（host）：按工作区 git 历史聚合日线 OHLC 蜡烛 | `dsh plugin --profile web add link:<dsh-web-ui>/packages/code-kline` |
| @deepseek-ai/dsh-client-ui-code-kline | 代码工作量 K 线（client）：侧边栏迷你图 + 个股页图表面 | `dsh plugin --profile web add link:<dsh-web-ui>/packages/ui-code-kline` |
| @deepseek-ai/dsh-live-stats | 实时 token 估算与生成吞吐（composer 统计区） | `dsh plugin --profile web add link:<dsh-web-ui>/packages/live-stats` |
| @deepseek-ai/dsh-skins | 皮肤聚合插件：全部皮肤包 + 皮肤中心一次到位 | `dsh plugin --profile web add link:<dsh-web-ui>/packages/dsh-skins` |
| @deepseek-ai/dsh-web-ui-all | 全家桶聚合插件：以上全部插件 + 皮肤全家桶 | `dsh plugin --profile web add link:<dsh-web-ui>/packages/web-ui-all` |

> `working-activity` 的 Web 半区有限制：浏览器端需要把其 `patches/webui-working-activity.patch` 应用到 DSH 源码（见包内 README / patches）；host 半区可直接以 bundle 安装。

## 来源与版权

| 包 | 来源 | 版权 |
| --- | --- | --- |
| task-board / git-graph / pet / remote-web-ui | dsh-external 组织自有，2026-08 由独立仓库迁入（git 历史随 subtree 保留） | BSD-3-Clause（dsh-external contributors） |
| working-activity | 社区插件，作者 chimney（ccch1mneyyy），原发布于 dsh-external/dsh-working-activity | MIT（版权归作者本人，LICENSE 保留于包内） |
| code-kline / ui-code-kline / live-stats | 原为 DSH 源码定制集成（packages/activity、packages/client），2026-08 迁入 | BSD-3-Clause |
| skins / dsh-skins / web-ui-all | 本仓库原生 | BSD-3-Clause |

维护规则：迁入第三方代码必须保留 LICENSE 与署名；活跃且有上游的第三方优先 fork 或依赖引用，不搬代码。详见 [docs/plugins.md](docs/plugins.md)。

## 新增插件

新插件先用脚手架生成标准 bundle 骨架，实现后再注册进聚合包。完整流程见 [docs/plugins.md](docs/plugins.md)：

```sh
node scripts/dsh-plugin-new <name>
```

## 优质推荐

两个最能打的外观，图为 gallery 试穿界面（`gallery/preview.html`）实拍。

### 蓝色幻想 · Blue Fantasy

DreamSkin「DeepSeek-鲸鱼娘」Codex 桌面主题的 dsh 适配：鲸鱼插画背景垫在半透明面板之下，遮罩随亮/暗主题实时切换；periwinkle 靛蓝调色板把全部 dsh token 重映射成蓝紫色调。

| 亮色试穿 | 暗色试穿 |
| --- | --- |
| ![蓝色幻想 · 亮色试穿](docs/premium/tryon-blue-fantasy-light.png) | ![蓝色幻想 · 暗色试穿](docs/premium/tryon-blue-fantasy-dark.png) |

```sh
dsh-skin use blue-fantasy
```

> 注意：`blue-fantasy` 需先安装（聚合包或 `dsh plugin --profile web add link:<dsh-web-ui>/packages/skins/blue-fantasy`）才能切换。

### Windows XP (Luna)

原汁原味的 Luna 复古体验：蓝色渐变窗口条 + 窗口按钮、侧边栏任务栏上的绿色「开始」按钮、米色状态栏（大写/数字/滚动指示灯）、Bliss 蓝天桌面，全局直角。

| 亮色试穿 | 暗色试穿 |
| --- | --- |
| ![Windows XP · 亮色试穿](docs/premium/tryon-xp-light.png) | ![Windows XP · 暗色试穿](docs/premium/tryon-xp-dark.png) |

```sh
dsh-skin use xp
```

---

## English

dsh-web-ui is the plugin family monorepo for the DeepSeek Harness Web GUI (evolved from the former skin collection). Previously standalone web GUI plugin repos now live under `packages/`; each plugin remains an official-standard bundle (`dsh.bundle.patch` manifest + `cordis.patch.yml` plugin row) and installs independently, while aggregate packages (web-ui-all / dsh-skins) install everything in one shot.

> This repository is private to the `dsh-external` organization. Organization members only. Never commit credentials or sensitive material.

## Layout

```text
dsh-web-ui/
├── packages/
│   ├── task-board/        @deepseek-ai/dsh-client-ui-task-board      task board
│   ├── git-graph/         @deepseek-ai/dsh-client-ui-git-graph       git branch / graph
│   ├── pet/               @deepseek-ai/dsh-pet                       whale pet
│   ├── remote-web-ui/     @deepseek-ai/dsh-remote-web-ui             phone remote control
│   ├── working-activity/  @deepseek-ai/dsh-working-activity          working status line
│   ├── skins/             skin collection (qq98/ths/xp/blue-fantasy/dragon-heir/skin-center/web)
│   ├── dsh-skins/         @deepseek-ai/dsh-skins       skins aggregate (all skins + skin-center)
│   └── web-ui-all/        @deepseek-ai/dsh-web-ui-all   family aggregate (all plugins + skins)
├── gallery/               skin try-on preview page
└── scripts/               build & scaffolding (dsh-skin / dsh-skin-new / dsh-plugin-new / aggregate.mjs)
```

## Quick Install

Prerequisite: DSH supports the profile/bundle mechanism (the `dsh plugin` command exists). `<dsh-web-ui>` below is a placeholder for this repository's path.

### Aggregate (one shot)

```sh
# all feature plugins + the skin family
dsh plugin --profile web add link:<dsh-web-ui>/packages/web-ui-all

# skins only (every skin package + skin-center)
dsh plugin --profile web add link:<dsh-web-ui>/packages/dsh-skins
```

### Standalone

```sh
# dev mode (link to this repo)
dsh plugin --profile web add link:<dsh-web-ui>/packages/task-board

# future release (GitHub)
dsh plugin --profile web add github:dsh-external/dsh-task-board
```

### Skins

Skin exclusivity is maintained in the managed section of `~/.dsh/cordis.patch.yml`; switching applies immediately:

```sh
dsh-skin use blue-fantasy   # or qq98 / ths / xp / dragon-heir
```

> A skin must be installed first (the aggregate, or `dsh plugin --profile web add link:<dsh-web-ui>/packages/skins/<skin>`) before it can be activated.

## Plugin List

| Package | What it does | Standalone install |
| --- | --- | --- |
| @deepseek-ai/dsh-client-ui-task-board | Task board: sidebar entry + multi-column kanban, local persistence, real task execution through dsh sessions, 5-field cron scheduling | `dsh plugin --profile web add link:<dsh-web-ui>/packages/task-board` |
| @deepseek-ai/dsh-client-ui-git-graph | Git branch / graph visualization | `dsh plugin --profile web add link:<dsh-web-ui>/packages/git-graph` |
| @deepseek-ai/dsh-pet | Whale pet widget | `dsh plugin --profile web add link:<dsh-web-ui>/packages/pet` |
| @deepseek-ai/dsh-remote-web-ui | Remote control of the Web GUI from a phone | `dsh plugin --profile web add link:<dsh-web-ui>/packages/remote-web-ui` |
| @deepseek-ai/dsh-working-activity | Working status line: live model activity (thinking / tools / turn summary) | `dsh plugin --profile web add link:<dsh-web-ui>/packages/working-activity` |
| @deepseek-ai/dsh-code-kline | Code-workload K-line (host): daily OHLC candles over per-workspace git history | `dsh plugin --profile web add link:<dsh-web-ui>/packages/code-kline` |
| @deepseek-ai/dsh-client-ui-code-kline | Code-workload K-line (client): sidebar mini chart + quote chart surface | `dsh plugin --profile web add link:<dsh-web-ui>/packages/ui-code-kline` |
| @deepseek-ai/dsh-live-stats | Live token estimates + generation throughput (composer stats) | `dsh plugin --profile web add link:<dsh-web-ui>/packages/live-stats` |
| @deepseek-ai/dsh-skins | Skins aggregate: every skin package + skin-center in one go | `dsh plugin --profile web add link:<dsh-web-ui>/packages/dsh-skins` |
| @deepseek-ai/dsh-web-ui-all | Family aggregate: all of the above plugins + the skin family | `dsh plugin --profile web add link:<dsh-web-ui>/packages/web-ui-all` |

> `working-activity` web-side caveat: its browser half requires applying `patches/webui-working-activity.patch` to the DSH source checkout (see its package README / patches); the host half installs as a plain bundle.

## Sources & Licensing

| Package | Origin | License |
| --- | --- | --- |
| task-board / git-graph / pet / remote-web-ui | dsh-external org-owned, consolidated 2026-08 from standalone repos (git history preserved via subtree) | BSD-3-Clause (dsh-external contributors) |
| working-activity | Community plugin by chimney (ccch1mneyyy), originally published at dsh-external/dsh-working-activity | MIT (copyright held by the author; LICENSE kept in the package) |
| code-kline / ui-code-kline / live-stats | Formerly in-source customizations of the DSH checkout (packages/activity, packages/client), consolidated 2026-08 | BSD-3-Clause |
| skins / dsh-skins / web-ui-all | Native to this repo | BSD-3-Clause |

Policy: third-party code merged in must keep its LICENSE and attribution;
active third parties with an upstream are forked or referenced as
dependencies instead of vendored. See [docs/plugins.md](docs/plugins.md).

## Adding a Plugin

Scaffold a new plugin from the template, implement it, then register it in the aggregate. Full guide: [docs/plugins.md](docs/plugins.md)

```sh
node scripts/dsh-plugin-new <name>
```

## Premium Picks

The two standouts, shot live from the gallery try-on simulator (`gallery/preview.html`).

### Blue Fantasy (蓝色幻想)

A dsh port of the DreamSkin "DeepSeek-鲸鱼娘" Codex desktop theme: whale-art backdrop beneath translucent panes, a scrim that swaps with the light/dark theme, and a periwinkle-indigo palette that remaps every dsh token into blue-violet tones.

| Light try-on | Dark try-on |
| --- | --- |
| ![Blue Fantasy light](docs/premium/tryon-blue-fantasy-light.png) | ![Blue Fantasy dark](docs/premium/tryon-blue-fantasy-dark.png) |

```sh
dsh-skin use blue-fantasy
```

> Warning: `blue-fantasy` first needs its package installed (the aggregate, or `dsh plugin --profile web add link:<dsh-web-ui>/packages/skins/blue-fantasy`).

### Windows XP (Luna)

Retro Luna done right: blue gradient window chrome with caption buttons, a green Start button on the sidebar taskbar, cream status bar with CAPS/NUM/SCRL indicators, the Bliss desktop, square corners everywhere.

| Light try-on | Dark try-on |
| --- | --- |
| ![Windows XP light](docs/premium/tryon-xp-light.png) | ![Windows XP dark](docs/premium/tryon-xp-dark.png) |

```sh
dsh-skin use xp
```
