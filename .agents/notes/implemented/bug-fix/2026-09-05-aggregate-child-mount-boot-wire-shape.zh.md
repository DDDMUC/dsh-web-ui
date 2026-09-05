# Agent Note: 聚合子插件挂载门控误读了 boot wire 形状

Status: implemented

## Problem

v0.3.15 的 #1372 修复([多问题合入](2026-09-04-multi-issue-landing-1368-1370-1372-1359.md))让聚合子插件的挂载依赖从 `__DSH_BOOT__.entries` 读取行级状态:家族子插件只有在其 patch 行 id(`web-ui-market`、`web-ui-plugin-manager` 等)或 `@linxin666/dsh-web-all/<family>` 子路径出现在活跃 entries 中时才会挂载。但这个 wire 契约并不存在。宿主的 boot entries 只由已伺服的 client bundle 组成([`graphRow`](../../../packages/dsh-git-graph/docs/ADR-001-plugin-boundary.md) wire 形状:`id` 是 bundle 包名,外加 `url`/`rev`/`inject`/`immediately`/`external`——没有 `name`、没有 `disabled`,永远不会出现 patch 行 id),所以任何 aggregate 安装下,gate 都找不到任何行 id,把全部家族子插件跳过。在受影响的 profile 里,整个 dsh-web 插件家族——Web 插件设置卡片、皮肤中心、创意工坊、宠物、任务看板、使用统计、会话归档 UI——同时从设置对话框中消失,即本次报告的严重恶性回归。

随 gate 一起提交的单元测试伪造了含行 id 的 boot payload(`bootWith(['web-ui-plugin-manager'])`),这种形状真实宿主从不产生,所以测试全绿而真实 GUI 已坏。

## Decision

`mountClientChildren` 恢复为 0.3.15 之前的双挂载保护语义:仅当子插件自身的包 id 出现在 `__DSH_BOOT__.entries` 中(该子插件经自己的 loader entry 伺服,例如同一 profile 里独立安装的 `@linxin666/dsh-session-archive`)才跳过,否则一律挂载。`CHILD_ROW_IDS`、boot entry 的 `name`/`disabled` 字段和行状态分支全部移除。模块文档现在记录了真实 wire 形状,以及 boot entries 为何无法表达行级启用状态。

本次回退实际上撤销了 #1372(隐藏已停用家族行的 UI 入口),该问题在出现真实信号前保持未解决:客户端需要宿主提供的行状态通道(或设置清单查询),而不是 bundle graph。新增回归测试钉住真实 wire 形状——一个填满包名 id 的 aggregate boot graph 必须仍然挂载全部家族子插件。正确信号的后续设计见[家族行状态路由](../../proposed/feature/2026-09-05-family-row-state-route.zh.md)。

## Testing

- `packages/dsh-web-all/tests/client-children-mount.spec.ts`:新增用例在真实形状的 boot graph(`@deepseek-ai/dsh-client-modules`、`@linxin666/dsh-web-all`、`@linxin666/dsh-perf` id)下挂载全部家族子插件;双挂载跳过与共享注册表用例继续通过;基于行 id 的用例因断言了错误契约而删除。包套件 26/26,仓库级 `pnpm typecheck` 与 `pnpm test` 通过。
- 真实 GUI(profile `web`,aggregate 经仓库 link 安装):重建 `lib/client.js` 后,挂载注册表持有 13 个家族子插件,独立安装的 session-archive 被正确跳过,设置对话框重新列出 Web 插件、皮肤、宠物、创意工坊、使用统计、会话归档分区,且创意工坊分区渲染出商店内容(皮肤 29 / 宠物 5 / 插件 5)。证据:`/tmp/dsh-web-fix-evidence/settings-restored.png`。

## Alternatives considered

- 通过匹配更多 id 拼写来修补 gate:拒绝——boot graph 根本不携带行状态,任何 id 拼写变体在真实宿主上仍会隐藏一切,而测试继续伪造 payload。
- 立即实现正确的 #1372 信号(宿主暴露活跃家族行,客户端挂载前查询):延后——这是新的宿主-客户端契约,不是热修;回退先行恢复服务。

## Consequences

aggregate 安装在所有伺服标准 boot graph 的宿主上重新挂载家族 UI。在 #1372 落地真实行状态信号之前,停用家族行后其 UI 入口会再次保持可见;点击此类入口仅使该子插件单独降级(故障隔离外壳),不影响其他插件。
