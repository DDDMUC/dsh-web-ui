# Agent Note: remote-web-ui 配对路由移除无效的 lanAddresses 依赖

Status: implemented

## Problem

`PairRoutesDeps.lanAddresses` 是导出的 `makeRoutes` 依赖接口里的必填字段,文档写着"the LAN IP literals the fence accepts"(fence 接受的 LAN IP 字面量),但实现从未读取它:解构绑定后无任何引用——手机侧 fence 每个请求实时读取 `service.lanAddresses`(这样热重绑才能生效),issue/status 响应也都直接读 service。于是每个调用方——插件入口和约三十处 `makeRoutes(...)` 测试调用——都传入了一个静默无效的值,而文档注释却声称它驱动 fence。未来贡献者若按文档把 fence 接到这个 dep 上(或通过填充它来"修复" fence),会在自以为遵循契约的情况下改变行为。

## Decision

该依赖被移除:`PairRoutesDeps` 中的字段及其文档行删除,解构不再绑定,插件入口不再传入,测试调用点删去实参。fence 继续每请求读取 `service.lanAddresses`,这正是所有测试已经钉住的行为(测试套件通过 `setLanBases` 设置 service 的 LAN 基址,而不是通过 dep)。可观察行为零变化:该值从未被读取。

## Alternatives considered

- 保留 dep 并把 fence 改为读它:否决——这会把 fence 冻结在构造时快照上,破坏每请求读取 `service.lanAddresses` 所支撑的热重绑行为(lan-bind 开关在进程中途更新 LAN 基址)。
- 把字段改为可选并加弃用说明而不删除:否决——该包是自己测试 seam 的唯一消费方,所有调用点都在树内,保留一个可选的死字段等于原样保留这次要移除的陷阱。

## Consequences

`makeRoutes` 的调用方现在只传实现真正读取的输入。fence 对 LAN 字面量的唯一事实来源是实时配对服务,接口不再宣称一个不存在的旋钮。
