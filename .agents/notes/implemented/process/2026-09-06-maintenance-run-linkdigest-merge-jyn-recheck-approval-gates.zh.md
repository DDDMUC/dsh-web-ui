# Agent Note: Maintenance run — linkdigest merge, jyn recheck, approval-gate playbook

Status: implemented

## Problem

2026-09-06 的分配队列里有四个开放 PR：一个需要做实用性/稳定性/兼容性三项强制审查的新第三方插件登记（#1379 dsh-linkdigest，尚无任何 review），一个反馈更新复审（#1362 jyn 宠物，在 2026-09-04 的 changes-requested 评审之后 force-push，带来第三款皮肤和一次 revert），以及两个仍在等作者的登记（#1318 dsh-git-badge、#1321 dsh-memory）。除逐个 PR 的判定外，本轮还要为一个外部贡献者 PR 清通 ruleset 的必需检查机制——它的 CI 在当前 head 上从未上报过结果。

## Decision

基于 `origin/dev`（`c14a0fdf`）处理，同一时刻只进行一个可变更动作：

- **#1379（dsh-linkdigest）批准并合并——合并提交 `ec706c5d`。**批准前三个维度都有证据。实用性：token 化社交链接解析在 54 条索引里是空白（deepread 覆盖公众号文章与文件，free-search 是网页搜索）。兼容性：条目在 PR 树上通过 `node scripts/community-index --check` 与 `node scripts/market-build --check`；bundle 使用的配置键（`transport: streamable-http`、`serverName`、`url`、`headers`、`toolCallTimeoutMs`）逐一对照本机安装的 `@deepseek-ai/dsh-mcp-client` 类型定义核实，且 `failOnStartupError` 默认 false，远端宕机只降级本插件、不会阻塞宿主启动。稳定性：插件是零依赖纯配置桥，无 key 时以 401 明确失败；上游仓库三天前才创建，长期兼容依赖登记时承诺的跟进维护。未在本机复现真实挂载（没有 API key，也不在运行中的服务旁再起一个宿主）；作者提供的挂载证据按其声明采信，并做了结构层面的交叉核对。
- **工作流审批闸门已发现并固化为操作手册。**首次贡献者的 fork PR 会让 `pull_request` 工作流停在 `action_required`，必需检查永远不上报，ruleset 静默地把 PR 压在 `BLOCKED`。通过 `POST /repos/{owner}/{repo}/actions/runs/{id}/approve` 批准后放行了 `ci.yml`（CI checks + plugin-mount）和 `agent-notes-guard.yml`。第二个坑：`ci.yml` 与 `pr-contribution-rules.yml` 都定义了名为 "Validate PR contribution evidence" 的 job，跑完的 `ci.yml` 会以 `skipped` 结论上报一条同名检查（该 job 仅在 push 事件运行），它成为该必需检查名的"最新一次"——即使所有必需检查在同一 sha 上都有成功记录，合并仍会被重新阻塞。重跑 `pr-contribution-rules.yml` 那次 run（`gh run rerun <id>`）让它的成功重新成为最新上报。全程无需 admin 绕过，闸门是在原地诚实通过的。
- **#1362（jyn 宠物）复审——仍为 changes requested。**2026-09-04 的三件事都在合入最新 `dev` 的测试合并上核实已修：`pet.gameplay.skin` / `pet.gameplay.skinDefault` 两个键已进 `packages/dsh-i18n/src/client/ru/pet.ts`（zh/en/ru 对齐），README 双语补齐了 `frames2d.skins` 与 `clickActions`、gameplay 契约和 32–1024 px 显示范围，CJK 文件名的预览图已删。force-push 新增第三款皮肤 `bingjing-gongzhu`（资产、轨道与 spec 断言完整），并把框架层 lowEnergy 支持整体 revert——该能力现在在整个仓库中不存在，文档与之一致。本地全量门禁绿：typecheck、test、i18n、market、aggregate。还剩两件文档收尾已提出：jyn 注册表行仍写"two selectable skins"而实际已有三款，以及内容改动后 `README.i18n.yaml` 未重录（`docs:check` 红，本地已复现）。
- **#1318 / #1321 继续搁置。**自 changes-requested 评审后作者无任何响应——无提交、无评论；不复审、不关闭。

合并方式按历史（#1306）再次确认：社区 PR 以 merge commit 落地。

## Alternatives considered

- 用 admin 权限强行合并被 `BLOCKED` 的 #1379（2026-09-04 轮对 #1371 的审批传播延迟就是这么处理的）：否决——这次的阻塞有真实且可修复的原因（必需检查未上报与被同名 skipped 覆盖），原地清通闸门才能让必需检查的信号保持诚实。
- 自己改掉 #1362 剩下的两行文档并推到贡献者的 fork：否决，理由与 2026-09-04 轮相同——注册表行的措辞是作者的内容，作者响应迅速，把精确的发现退回去能保持作者归属干净。
- 在本地第二个 DSH 宿主里复现 #1379 的真实 MCP 挂载：否决——需要 API key，还要在运行中的服务旁再起一个宿主；对一个纯索引数据 PR，用安装版 SDK 做模式级验证加上作者的挂载证据已经足够，其运行时失败模式也只是单个插件内的 401。
- 把 #1383（dsh-search-router）纳入范围：不适用——它在本轮开始前已关闭，默认范围是分配给维护者的开放 PR，未做处理。

## Consequences

远程 `dev` 包含 dsh-linkdigest 登记（合并提交 `ec706c5d`），其再生的 `market/dist` 已在 PR 树上验证一致。jyn 宠物等作者改完皮肤数量措辞并重录配对哈希后即可落地；lowEnergy 支持在有人再次以契约扩展的形式提出之前从代码库中消失。今后首次贡献者的合并按两步闸门手册执行——先批准 `action_required` 的 run，再在被同名 skipped 覆盖时重跑 evidence 工作流——不再需要 admin 绕过。2026-09-04 轮记录的聚合包产物过期问题在本轮自愈：jyn 的测试合并顺带重建了 `packages/dsh-web-all/lib/client.js`，任务看板模型选择器的改动已包含其中。
