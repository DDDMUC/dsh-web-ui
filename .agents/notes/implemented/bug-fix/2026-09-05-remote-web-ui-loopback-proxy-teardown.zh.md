# Agent Note: remote-web-ui 回环 HTTP 代理双向拆除

Status: implemented

## Problem

`pipeLoopbackHttp` 把手机的门控 HTTP 流量转发到 127.0.0.1 时,只接了一个方向的失败处理(`upstream.on('error')`),与同文件的 WebSocket 版 `proxyLoopbackUpgrade`(error 和 close 双腿拆除)不一致。由此产生两个连接稳定性缺口,均已在 `tests/loopback-proxy.spec.ts` 中用真实服务器复现:

1. **外端断连不会停止内端请求。** 手机在网络弱或关闭标签页时中断请求后,`req.pipe(upstream)` 只是解除管道而不销毁上游调用:回环服务器继续接收被截断的请求体并继续处理,还占用着一条连接——复现中,孤儿内端请求永不结束,连 `server.close()` 都无法完成。
2. **内端重置让外端请求无限悬挂。** 回环上游在响应中途死掉时,没有任何机制去销毁外端:手机的请求一直悬挂(复现:客户端直到自身 5 秒超时都没等到结束)。依 Node 版本与时机不同,被截断的上游响应还可能在没有监听器的响应流上抛出 `'error'`——一条未处理错误路径。

## Decision

`pipeLoopbackHttp` 现在与升级路径保持同一套双腿拆除纪律:

- `upstreamRes.on('error')` 销毁外端响应,内端流中重置立即结束手机的请求。
- `res.on('close')` 在外端先于上游响应结束而关闭时销毁上游调用——用 `!upstreamRes.readableEnded` 守卫,正常完成绝不销毁全局 agent 还要复用的 keep-alive 连接。
- `req.on('error')` 在外端请求体中途放弃时销毁上游调用,回环服务器不再处理没人会读的调用。

## Testing

- `tests/loopback-proxy.spec.ts`(新增,回环真实 HTTP 服务器):外端体中放弃使内端请求被中止(且两个服务器都能干净关闭);内端流中重置后,外端收到响应头与部分体并以提前结束收尾;五次顺序代理请求只打开一条上游连接。
- 区分度核对:用补丁前的 `loopback-proxy.ts` 运行,放弃与重置两个测试失败(孤儿内端请求卡住 `server.close()`;外端客户端悬挂到超时);打上补丁后三个测试约 150ms 全过。keep-alive 测试在两个版本上都通过,钉住了拆除守卫不回退连接复用。

## Alternatives considered

- 用 `stream.pipeline` 的自动拆除替代 `pipe`:否决——其自动拆除在正常完成时也会销毁上游,除非另加守卫,会回退 keep-alive 复用;三个针对性钩子精确表达了想要的策略。
- 用上游超时替代拆除接线:否决——超时只能在事后约束悬挂,既不能在放弃时止住内端的无用功,也无法区分慢而未死的内端响应,而时长是运行时不应瞎猜的策略。

## Consequences

手机断连或内端重置的代价从"孤儿内端请求"或"悬挂的手机请求"变为"一对被及时重置的连接"。顺序的门控 HTTP 流量继续复用单条回环连接。
