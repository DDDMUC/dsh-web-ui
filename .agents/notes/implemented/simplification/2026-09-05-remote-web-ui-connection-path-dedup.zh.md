# Agent Note: remote-web-ui 连接路径去重与死守卫移除

Status: implemented

## Problem

插件连接路径上(或紧邻处)累积了三处小规模重复/死代码,每一处都是未来修改时"改了一份漏了其他份"的隐患:

1. `src/index.ts` 把完全相同的宿主 resolve 垫片(`specifier => { try { return requireFromHost.resolve(specifier) } catch { return undefined } }`)重复了三次——锚路径解析器和 update 的 check/run 两个 seam 各一份。
2. `src/routes.ts` 在三处(`lanFence` 的 cookie 回退、`handleAccept`、`handleAcceptPage`)解析请求 Host 并求值私网 LAN 回退(`isPrivateOrLocalHostname` + `isNonCrossSite`),围绕同一语义有着形状各异的写法(`typeof` 守卫位置、空 hostname 处理各不相同)。
3. `src/client/mobile-adapt.ts` 用一个 `lastComposerTapRegistered` 标志守卫 composer 的 `pointerdown` 监听器,但该标志可证明是死的:整个适配层只安装一次(`__dshRemoteAdaptInstalled`),执行到这里时标志恒为 `false`,它只是把监听器注册搅得难读。

## Decision

一个 `hostResolve` 常量替换三份垫片;模块级 `privateLanHostOf(request)` 在 Host 指向私网/本地主机名且浏览器标记非跨站时返回该 Host(否则 `undefined`),三个调用点全部改用它——`lanFence` 保持惰性求值(辅助函数只在信任主机分支未命中后运行);死标志删除,监听器无条件注册。行为零变化:每个被移除的副本在语义上都相同,该标志永远取初始值。

## Alternatives considered

- 把 `privateLanHostOf` 与 `isTrustedApiRequest` 的 Host 解析统一起来:否决——信任 fence 匹配的是已配置/已广播的权限,不应掺入私网 LAN 概念;合并会把两个不同的信任决定纠缠在一起。
- 保留三份垫片加注释了事:否决——重复恰好位于 update seam 内部,未来 seam 变化(多一个 resolve 选项)将不得不在同一文件里改三次。

## Consequences

私网 LAN 回退只剩一个定义,由 docker/反向代理测试钉住;update seam 共享一个解析器;移动端监听器注册回归它本来的直白样子。包行为不变(343 个测试通过,含代理生命周期、docker 配对与路由族套件)。
