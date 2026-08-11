# dsh-web-ui · DSH Web GUI 插件全家桶

中文 | [English](README.en.md)

本仓库是 DeepSeek Harness（DSH）Web GUI 的插件全家桶 monorepo，由原「皮肤集合」仓库升级而来。多个原本独立的 web GUI 插件已迁入 `packages/`：每个插件仍是符合官方标准的独立 bundle（`dsh.bundle.patch` 清单 + `cordis.patch.yml` 插件行），可单独安装；同时提供聚合插件包（`web-ui-all` / `dsh-skins`）一键装齐。

> 本仓库属于 `dsh-external` 组织，仅组织成员可见（private）。请勿提交任何凭据、密钥或内部敏感信息。

## 特性一览

- 全家桶 monorepo：功能插件与皮肤集合单仓维护，每个包可独立安装，也可用聚合包一键装齐
- 官方标准 bundle：每个插件包都符合 DSH profile/bundle 规范，`dsh plugin --profile web add ...` 直接可用
- 皮肤中心：皮肤启用互斥由 `~/.dsh/cordis.patch.yml` managed 区段维护，`dsh-skin use` 即时切换
- 试穿预览：`gallery/preview.html` 提供皮肤实机试穿，亮/暗主题所见即所得

## 目录结构

```text
dsh-web-ui/
├── packages/
│   ├── task-board/        @deepseek-ai/dsh-client-ui-task-board      任务看板
│   ├── git-graph/         @deepseek-ai/dsh-client-ui-git-graph       Git 分支/图谱
│   ├── pet/               @deepseek-ai/dsh-pet                       鲸鱼娘宠物
│   ├── remote-web-ui/     @deepseek-ai/dsh-remote-web-ui             手机远程控制
│   ├── working-activity/  @deepseek-ai/dsh-working-activity          工作状态行
│   ├── code-kline/        @deepseek-ai/dsh-code-kline                代码工作量 K 线（host）
│   ├── ui-code-kline/     @deepseek-ai/dsh-client-ui-code-kline      代码工作量 K 线（client）
│   ├── live-stats/        @deepseek-ai/dsh-live-stats                 实时 token 估算与吞吐
│   ├── skins/             皮肤集合（qq98 / ths / xp / blue-fantasy / dragon-heir / skin-center / web）
│   ├── dsh-skins/         @deepseek-ai/dsh-skins      皮肤聚合插件（装它 = 全部皮肤包 + 皮肤中心）
│   └── web-ui-all/        @deepseek-ai/dsh-web-ui-all  全家桶聚合插件（装它 = 全部功能插件 + 皮肤全家桶）
├── gallery/               皮肤试穿预览页
├── docs/                  插件接入指南与设计文档
└── scripts/               构建与脚手架（dsh-skin / dsh-skin-new / dsh-plugin-new / aggregate.mjs / link-profile.mjs 等）
```

## 快速安装

前提：DSH 支持 profile/bundle 机制（`dsh plugin` 命令存在）。以下命令中 `<dsh-web-ui>` 为本仓库路径占位。

### 聚合安装（一键装齐）

```sh
# 全部功能插件 + 皮肤全家桶
dsh plugin --profile web add link:<dsh-web-ui>/packages/web-ui-all

# 仅皮肤全家桶（全部皮肤包 + 皮肤中心）
dsh plugin --profile web add link:<dsh-web-ui>/packages/dsh-skins
```

本机开发时，先用脚本建立/刷新 loader 链接层（`~/.dsh/profiles/node_modules/@deepseek-ai`，幂等可重复运行）：

```sh
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

皮肤类插件改用 `node scripts/dsh-skin-new <name>` 脚手架，不经过 `web-ui-all` 注册流程（见 [docs/plugins.md](docs/plugins.md) 第 88 行附近说明）。
