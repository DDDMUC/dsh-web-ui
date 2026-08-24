# 匿名安装遥测（telemetry）

English 文档随包发布；本文是全家桶遥测机制的唯一事实源，各包 README 与市场 API 文档只链接到这里。

## 统计什么

dsh-web-ui 通过两类匿名事件统计真实使用规模：

| 事件 | 触发方 | 含义 | 去重粒度 |
| --- | --- | --- | --- |
| `pageview`（PV） | dsh-market.com 页面脚本 | 站点页面访问 | 访客 ID + 路径 + UTC 日，每日一条 |
| `heartbeat` | 已接入插件（Skin Center、创意工坊、Pet）的浏览器半区 | 该浏览器里该包处于安装且启用状态 | 访客 ID + 包名 + UTC 日，每日一条 |

UV（独立实例数）= 当日去重访客 ID 数；因此「安装量」读作心跳 UV，「日活」读作当天有心跳的实例数。

## 收集与不收集什么

每个浏览器在 `localStorage` 里生成一个纯随机 UUID 作为访客 ID，不与任何账号、会话或内容关联。上报载荷只有：随机访客 ID、事件类型、UTC 日期、站点路径或包名（含已知版本号）。worker 在入库前用部署侧盐值对访客 ID 做 SHA-256 哈希，原始 ID 不落库；IP 地址不存储。汇总接口（`GET /api/telemetry/summary`）只返回计数聚合，永不暴露原始事件。

发送是 fire-and-forget：网络不可达时静默失败，下次挂载或次日自动补报一次；标记位只在服务端接受后才写入，离线浏览器不会因此漏计整天。隐私模式等存储不可用的环境下不发任何请求。事件保留 400 天，过期由汇总读取时机会式清理。

## 查看数据

```sh
curl -s 'https://dsh-market.com/api/telemetry/summary?days=30'
```

返回最近 N 天（1-365）的站点 PV/UV 日序列与热门路径、各包的累计实例数与当日活跃数。机器可读契约见 `/openapi.json` 中 `/api/telemetry/*` 两项。汇总接口由 `TELEMETRY_READ_KEY` secret 保护：携带 `x-telemetry-key` 头或 `?key=` 参数才可读取。

### 私有实时视图

`market/telemetry-view`（部署为 worker `dsh-market-telemetry-view`，地址 `tv.dsh-market.com`）是只读仪表盘：每次访问实时拉取汇总接口并渲染日 PV/UV、热门路径与各包安装量/当日活跃，自身不存任何数据。访问保护双层：路由应挂 Cloudflare Access 自托管应用（邮箱验证），worker 内部同时校验 Access JWT 签名（`ACCESS_TEAM` + `ACCESS_AUD` secret，未配置前默认拒绝服务）。

## 接入新包

reporter 的事实源在 `shared/client/telemetry.ts`，包内副本经 `scripts/sync-shared.mjs` 同步（禁止手改）。接入只需两步：在 `sync-shared.mjs` 的 `telemetry.ts` 条目下加目标路径并重跑同步；在该包 `src/client/index.ts` 的 `apply()` 开头调用一次 `reportDailyHeartbeat([{ name: '<npm 包名>' }])`。行为测试参照 `packages/dsh-market/src/client/telemetry.test.ts`。

## 部署

端点实现在 `market/worker/src/telemetry.js`，表结构在 `market/worker/migrations/0002_telemetry.sql`，部署时需对 D1 应用迁移。设置 `TELEMETRY_SALT` secret 可更换哈希盐值；未设置时使用内置默认盐，仅影响哈希值不影响语义。
