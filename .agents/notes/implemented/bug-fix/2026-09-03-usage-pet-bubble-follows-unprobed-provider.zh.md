# Agent Note: Pet bubble follows the session provider even when it has no probe facts

Status: implemented

## Problem

dsh-usage 的宠物公告气泡只在会话提供方能够解析到已探测快照时才发布：`announceCurrent()` 先查 `snapshots.get(provider)`，再回落到该提供方的适配器家族，两者皆无时静默返回。会话运行在适配器目录之外的 provider 上的部署——中转站、本地运行时、token 套餐类厂商——完全看不到气泡：代码里存在"跟随当前会话提供方"的联动，但对这些会话真正使用的 provider 永远不可达。2026-09-03 实测确认：会话路由为 `jiyuan`（tokenrhythm.studio），overview 报告 `current` 为 `{ provider: 'jiyuan', source: 'live' }`，而 `/api/pet/state` 在每个轮询周期都返回 `announcement: null`。

对该部署而言增加适配器并不可行：tokenrhythm.studio 不暴露任何余额/套餐端点——OpenAI 计费对 `/v1/dashboard/billing/subscription` 与 `/v1/dashboard/billing/usage` 均返回 404，`/api/usage/token`、`/api/quota` 及无前缀变体同样 404（诊断时已用存储凭据逐一探测）。

## Decision

当会话提供方没有可公告的探测事实时，`announceCurrent()` 回落到该提供方今日的台账用量——台账对每个 provider 都拥有的唯一事实：

- `buildLedgerAnnouncement({ displayName, totals })` 构造 `kind: 'cost'` 载荷（`今日 <tokens> tokens`，note 为 `<calls> 次调用`，tone `ok`）；calls 与 tokens 同时为零时返回 undefined——空洞的气泡是噪音而非信息。
- `formatTokens()` 按中文量级渲染（`9805`、`9.7万`、`1.2亿`），与服务既有的宿主侧文案口径一致。
- 回落统一覆盖所有静默场景：完全没有适配器、探测失败（只有错误槽没有事实）、以及宠物校验器拒绝的无百分比套餐窗口。可探测且有事实的 provider 保持既有的 cost/balance/plan 气泡；宠物公告契约（[pet-announcement-bubble](../feature/2026-08-29-pet-announcement-bubble.md)）不变——回落只是拓宽了 usage 插件会发出的载荷范围。
- 显示名先取 LLM 运行时，再取适配器，最后退回路由 id，因此无适配器的路由也有可读标题。
- 事实与今日用量皆无时气泡保持沉默。

模式语义原样保留：`always` 每个轮询周期重新发布（用量实时增长），`change` 比对载荷签名（用量增长会重新发布），`off` 跳过。

## Testing

- `packages/dsh-usage/tests/usage-service.spec.ts`：无适配器路由触发回落发布（并断言没有发出任何探测 HTTP）、已探测快照无百分比窗口时触发回落、事实与用量皆无时保持沉默、change 模式下用量增长重新发布，以及 `buildLedgerAnnouncement`/`formatTokens` 契约经 `parseAnnouncement` 往返校验。
- 宿主半区生效需要重启 `dsh web`（仓库规则：agent 不得重启运行中的服务）。该部署的 profile 挂载解析到本工作区 checkout，重启后的宿主直接加载修复；重启前运行中的宿主仍是旧 bundle。

## Alternatives considered

- 为 `jiyuan`/tokenrhythm.studio 增加余额适配器。否决：该中转站完全不实现计费端点（已用存储凭据验证），且把用户专属路由写进通用适配器目录无法泛化——下一个中转站会带来同样的静默。
- 会话提供方没有事实时回落到"最近探测过的 provider"的事实。否决：会把别家账户的余额或套餐冒充为会话提供方的数据——主动误导，比沉默更糟。
- 一只弱化的"该 provider 暂无数据"气泡。否决：它会在每个不支持的 provider 上常驻屏幕，只添噪音不给信息；用量页签已经承载了逐 provider 的错误行与未配置凭据行。
- 预先给探测接口扩展"双请求计费对"以服务中转站。否决：本次改动没有观测到任何中转站实现该计费对，未被使用的接口扩展属于投机；将来出现时，成对形态的适配器可以直接接入现有探测循环。

## Consequences

- 每个会话提供方只要拥有任何可公告事实就会产生气泡——探测事实优先，台账用量其次；今日零用量的 provider 保持沉默。
- 回落载荷走既有宠物公告契约，TTL 与模式处理不变；无线上协议或持久化格式变化。
- 回落只报告消耗量，绝不报告剩余额度：没有真实端点时气泡展示用量，不虚构余额。
