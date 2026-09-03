# Agent Note: remove dsh-desktop-launcher

Status: implemented

完成 [Electron 桌面应用](../architecture/2026-09-03-electron-desktop-app.zh.md) 开启的桌面方案收敛：桌面应用骨架已实机验证，接替其职责的插件不再值得付出跨包维护成本。取代插件自身的修复记录（[工作目录](../bug-fix/2026-08-25-desktop-launcher-working-directory.zh.md)、[浏览器启动](../bug-fix/2026-08-29-desktop-launcher-browser-launch.zh.md)）——那些决策描述的包已不存在。

## Problem

仓库同时维护两个桌面故事：desktop-launcher 插件（为已安装的 `dsh web` 创建桌面图标，外加悬浮电源按钮退出宿主）与打包完整运行时的 Electron 桌面应用。插件的前提——「已存在可用的 dsh 工具链」——与桌面应用的前提正好相反；Electron 笔记最初以「插件继续作为轻量路径」保留两者。此后每次横切改动都在为这份重复买单：插件占有一个设置桥白名单条目、一条远程通道物理本地控制面、一个中央 ru 语言包命名空间、i18n 审计与 sync-shared 消费者行、一条聚合 patch 行和一个家族 subpath 导出。

## Decision

dsh-desktop-launcher 彻底移除：包目录；聚合清单行及全部再生成产物（patch 块、家族 subpath 导出、workspace 依赖——生成器的 keep-unknown-deps 规则意味着依赖行必须手删；client-children 挂载条目）；设置桥白名单条目；远程通道物理本地控制面（`/api/dsh-desktop-launcher` 前缀常量、boot 脚本门、客户端改写豁免及其测试——控制面减为三个）；中央 ru 命名空间；i18n 审计包行与 sync-shared 消费者/目标条目；labeler 路径、publish-prep 行与根 README 条目。

npm 名字退役但不下架：`@linxin666/dsh-desktop-launcher@0.3.13` 仍在 npm 上，npm-badge 家族下载总量继续统计它（已发布名字惯例，与 live-stats、aionui 一致），且桌面应用的运行时 seed 仍固定在 0.3.13 聚合包——其依赖闭包仍含启动器，下次聚合包升版时自然消失。Electron 桌面应用自此是唯一的桌面路径。

## Alternatives considered

- 保留插件（默认关）作为既有安装的轻量路径（Electron 笔记最初的立场）：否决——两套并存让每次跨插件改动（设置桥、远程门、i18n 对齐、sync-shared）都翻倍，且拥有工具链的用户直接敲 `dsh web` 即可，不需要设置卡。
- 保留远程通道物理本机前缀作为将来复加的纵深防御：否决——为不存在的面保留活着的门会误导安全审阅；真正复加时自会带上门与测试。

## Consequences

在桌面应用交付前，用户失去桌面图标生成与悬浮电源按钮；已创建的图标不受影响——`$DSH_HOME/desktop-launcher/` 下生成的脚本直接调 `dsh`，运行时不经过插件。远程通道的物理本地控制面缩为三个。本改动属 bundle 层：用户重启 `dsh web` 后生效；若 live profile 残留 resolver-only 依赖，没有 patch 行它不会挂载，下次 profile heal 时被清理。

## Testing

`node scripts/aggregate.mjs` 再生成 patch（19 源块、20 行、18 依赖）且 `--check` 通过；`pnpm install` 从 pnpm-lock.yaml 剪掉 workspace importer，重建后的 `packages/dsh-web-all/lib` 已无启动器痕迹；仓库级 `pnpm typecheck`、`pnpm test`、`pnpm test:scripts`、`pnpm docs:check`、`pnpm i18n:check`、`pnpm aggregate:check` 全绿。有意保留的提及：本笔记及其交叉链接、Electron 笔记中的历史、插件旧修复笔记、冻结的 `docs/archive/` 与发布说明、npm-badge 已发布名字清单，以及固定在已发布 0.3.13 聚合包上的桌面运行时 seed/lockfile。
