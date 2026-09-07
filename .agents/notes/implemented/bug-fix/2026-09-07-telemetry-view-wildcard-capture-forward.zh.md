# Agent Note: tv.dsh-market.com 经主 worker 的通配捕获转发

Status: implemented

## Problem

`dsh-market-telemetry-view`（`tv.dsh-market.com` 上的私有看板）从 2026-09-02 起失去全部流量：Cloudflare 调用分析显示 09-02 当天仍有每日请求，09-03 起归零，而精确自定义域附件始终 `enabled`，Cloudflare Access 门也一直正常应答。中继功能把 `*.dsh-market.com` 通配 Workers 自定义域挂到 `dsh-market` 商店主 worker 时（[固定域名中继](../feature/2026-09-02-stable-hostname-relay.zh.md)），所有单层子域名——包括 `tv.`——都被主 worker 捕获：zone 路由跑在自定义域前面，而主 worker 从不调用其身后看板 worker 的精确自定义域。于是访问 `tv.dsh-market.com` 在 Access 登录成功后渲染的是商店 SPA——中继分支只认 16 位 id，`tv` 落到主页资源分支——Access 登录依然可用，把路由变更掩盖成了看板故障。

## Decision

主 worker 显式接管 `tv.dsh-market.com` 主机名：fetch 入口在任何分发之前把整个主机名经 `TELEMETRY_VIEW` 服务绑定转发给 `dsh-market-telemetry-view`。服务绑定保留请求头，`Cf-Access-Jwt-Assertion` 随请求透传，看板继续自行校验 Access JWT。`/app.js` 加入 `run_worker_first`：不加的话，被捕获主机名上的该路径会在 worker 运行前被 assets-first 直接用主站自己的 `/app.js` 资源应答；其余主机名上，主 worker 对该路径显式回退到 `env.ASSETS.fetch`。事故前遗留的无路径 zone 路由 `*.dsh-market.com`（2026-09-02 事故的旧模式）已从 zone 删除，只保留带路径的 `*.dsh-market.com/*` 一条通配路由。`docs/telemetry.md` 记载了该路由关系。

## Alternatives considered

删除通配 zone 路由或通配自定义域被否决：中继功能与其零配置配对依赖通配捕获（[固定域名中继](../feature/2026-09-02-stable-hostname-relay.zh.md)）。把看板搬到 zone 外的 workers.dev 主机名再挂 Access 被否决：workers.dev 在国内访问不可靠，且放弃了干净域名。靠重新摘挂域名恢复精确自定义域优先被否决：路由模型把 zone 路由放在自定义域前面，与挂载顺序无关，捕获会再次发生。把看板代码并入主 worker 被否决：私有查看器的部署节奏与 Access secret 会耦合到公开的商店 worker 上。

## Consequences

主 worker 重新部署后，看板在 `tv.dsh-market.com` 上恢复工作；看板 worker 自身无需改动。主 worker 从此在部署时依赖 `dsh-market-telemetry-view` 存在——服务绑定解析失败会让部署直接失败，这是响亮且正确的失败。商店行为其余不变：`tv.` 以外所有主机名的 `/app.js` 与之前一样由同一份资源应答，中继主机照旧代理包括 `/app.js` 在内的全部路径（中继分发在新分支之前）。`/data` 代理路径无需加入 `run_worker_first`，因为没有资源遮蔽它。

## Testing

`node --test scripts/market-tv-forward.test.mjs`（3 通过）：`tv.` 主机名对 `/` 与 `/app.js` 的转发保留 Access JWT 头，商店主机名应答自己的 `/app.js` 资源且不触碰绑定。部署证据：deploy-market 工作流必须带新服务绑定通过，且一次已认证的 `tv.dsh-market.com` 访问必须看到看板（Access 门挡住未认证探测，需所有者在浏览器确认）。
