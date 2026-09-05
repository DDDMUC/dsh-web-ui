# Agent Note: 面向 #1372 UI 门控的家族行状态路由

Status: proposed

## Problem

停用聚合包的某个家族行(`web-ui-market`、`web-ui-plugin-manager` 等)只影响宿主半:loader 不会启动该 entry,行的后端通道随之消失;但 aggregate 客户端 bundle 仍然无条件注册该行的设置 tab。tab 保留且点击报错——这就是 #1372 的诉求。第一次修复尝试(v0.3.15)用 `__DSH_BOOT__.entries` 做挂载门控,次日即被回退([聚合子插件挂载的 boot wire 形状](../../implemented/bug-fix/2026-09-05-aggregate-child-mount-boot-wire-shape.md)):boot entries 只携带已伺服 bundle 的包名 id,无法表达行级状态。回退恢复了服务,但 #1372 保持未解决:被停用的行仍留着可见的 UI 入口。

## Proposal

让 aggregate 的浏览器半能拿到「哪些家族行处于活跃状态」的权威答案,且由 aggregate 自己的宿主半提供服务,走每个家族插件已在用的同插件路由惯例(同源 fetch 到 `webServer.register` 路由,同任务看板的 `HttpTaskBoardHostTransport`)。

宿主半(`packages/dsh-web-all/src/shell.ts` + 新增 `rows.ts` ledger):

- shell 已按家族行各运行一次,并知道该行的子插件包名(`config.plugin`,如 `@linxin666/dsh-client-ui-market`——与客户端 children 同一命名空间)。每次 shell apply 把该名字记入模块级活跃行 ledger;entry dispose 时移除(`ctx.effect`,即 degraded 路由的引用计数模式)。在 apply 开始时记录,而非成功启动后:已启用但降级的行保留其 tab(诚实状态),只有被停用的行失去入口。
- self 行(`web-ui-compat`,无 config)额外负责路由注册,这样即使全部家族行被停用,路由仍然存活。注册沿用与现有 degraded 路由相同的引用计数与单例纪律。
- 新路由 `GET /api/dsh-web-all/rows` 返回 `{ ok: true, children: ["@linxin666/dsh-client-ui-market", ...] }`——活跃子插件包名列表。除平台默认外不加额外栅栏,与所有现有家族 `/api` 路由一致;payload 不暴露任何已发布 bundle 之外的信息。

浏览器半(`mount-children.ts`):

- 挂载前先 fetch 该路由,带短超时与防御性形状校验。任何不确定——网络错误、非 200、形状不符、超时、路由不存在(旧版宿主半)——都视为「未知」,门控**失败放行**:全部家族子插件照常挂载,与当前热修行为完全一致。只有路由返回了形状完好的活跃集合、且其中缺少某子插件名时,才允许隐藏该子插件。
- 双挂载保护不变:自身包 id 出现在 `__DSH_BOOT__.entries` 中的子插件仍先被跳过(独立安装优先)。
- `mountClientChildren` 变为 async,客户端 `apply` 等待它。各 tab 晚几十毫秒注册,无其他顺序依赖。

一致性门禁:新增测试断言每条家族行的 `config.plugin` 都是已知 client-child 名,避免未来新增家族时静默破坏行配置与客户端 ledger 键的连接。

## Context & Efficiency Impact

每次页面加载多一个同源 GET(几百字节,`no-store`),宿主端一个内存 Map,shell/client 合计约 100 行外加测试。无 schema、协议或磁盘格式变更;路由纯增量且版本偏差安全(404 降级为失败放行)。

## Alternatives considered

- 查询宿主 `loader` 服务(`inject: ['loader']`,读 `entry.options.id`/`options.name`/`entry.disabled`):信号最权威(能求值 `!!js` 禁用表达式与祖先继承),但把插件耦合到宿主 loader 内部实现,且相比 ledger 无增益——loader 只启动已启用的行,shell apply 缺席即意味着停用,无论原因是什么。
- 复用官方插件清单 UI 的数据源:那是宿主内部实现,随宿主版本变化,不是已发布的插件契约;同样的耦合问题。
- 先挂载再裁剪(全部挂载,fetch 返回后注销 tab):slot 与副作用清理在每个家族 UI 上都不可靠;先可见后消失的 tab 比稍延迟的挂载更糟。
- 服务端裁剪(按行伺服独立 client bundle):重构单 bundle 聚合架构;[#1372 讨论](../../implemented/bug-fix/2026-09-04-multi-issue-landing-1368-1370-1372-1359.md)中已因性能与结构原因否决。

## Acceptance criteria

- 停用任意单个家族行并刷新 GUI 后,该行的设置入口消失;其他家族入口全部保留;重新启用后恢复。
- 路由不可达、报错或形状损坏时,全部家族子插件照常挂载(与回退后热修行为逐位一致)——v0.3.15 式「全部隐藏」故障在构造上不可能复现。
- 独立+aggregate 混合安装仍通过 boot entries 双挂载保护,与行状态无关。
- 包级与仓库级门禁通过;live GUI QA 在真实 profile 上演练停用/启用并留存截图。

## Risks

- 残余边界:compat 行与全部家族行都被停用时无路由持有者,客户端失败放行,为已停用行显示报错 tab(即前 0.3.15 行为)。接受并记录。
- 该路由与所有插件 `/api` 路由一样不鉴权(index/网关鉴权不覆盖具名路由);它只泄露活跃家族子插件名。接受为平台既有水平;若平台未来提供路由级鉴权再跟进。
- 页面保持打开期间的行切换只在 loader 的插件变更刷新后生效;可接受(与 degraded 路由相同的新鲜度模型)。
