# Agent Note: dsh-pet asset and runtime routes revalidate with an ETag

Status: implemented

## Problem

'/pet/<id>/*' 资产路由与 '/api/pet/runtime/*' 路由对每个请求都回答 `'cache-control': 'no-cache'`,却不带任何验证器。`no-cache` 允许复用的前提是重验成功,而没有 `ETag`/`Last-Modified` 可验,浏览器就在每次页面加载与渲染器重挂载时全量重新下载响应体。这些正是插件服务的最大载荷:最高 20 MB 图片上限的精灵图集、frames2d 宠物的逐帧图片、以及每个 live2d 宠物每次页面加载都要取的 Cubism Core 与 vendor bundle。decoration 路由早已用弱 ETag 加 304 路径解决了同一问题,注释里写明了同样的理由;两个更大的路由却始终没有获得同等处理。

## Decision

`packages/dsh-pet/src/routes.ts` 在 `assetHandler` 与 `runtimeHandler` 中计算弱 ETag(size + mtime,取自尺寸上限检查本就要做的 `stat`),对匹配的 `If-None-Match` 请求回答 304,并在 200 响应上盖验证器。ETag 计算与 304 握手收敛为共享的 `weakEtag`/`revalidated` 助手,三个文件路由统一使用——decoration 处理器逻辑不变,只是不再重复。

每个文件的线上行为除此之外完全一致:同样的字节、同样的 content type、同样的尺寸上限、同样的 `no-cache` 策略(过期副本绝不跳过重验使用,磁盘上更新的图集只要 mtime/size 变化立即生效)。

## Alternatives considered

- **`max-age` + `immutable` 配内容哈希 URL**:否决——资产 URL 不含内容哈希,替换宠物文件后会在 TTL 内一直拿到旧副本;`no-cache` + 验证器以每次复用一次廉价重验的代价换取精确的新鲜度。
- **用 `Last-Modified` 代替 `ETag`**:否决——秒级 mtime 会漏掉快速连续写入;size+mtime 与既有 decoration 验证器一致且零额外成本。
- **给合成的 pet.json 分支加 ETag**:暂缓——该响应体每进程在内存中现算且很小,收益不值得扩大本次改动。

## Consequences

- 重复页面加载与渲染器重挂载把图集/帧/runtime 请求落为空体的 304,不再重复下载最高数十 MB。
- 服务端每请求成本增加一次字符串格式化;`stat` 调用本来就在为尺寸上限服务。

## Testing

- 实测(环回,5 MB 图集重挂载 20 次,共 3 轮,取中位数):改动前世界(无验证器,每请求全量下载)每轮传输 100.0 MB(65-90 ms);ETag 重验后同样的 20 次重挂载响应体传输 0 KB(3-4 ms)。广域网下字节节省是主要收益。
- `tests/routes.spec.ts` 钉住契约:图集 200 + `etag` 头、`If-None-Match` 重放得 304 空体、伪造验证器重新 200,以及经 `runtimeDir`/`vendorDir` 测试缝对两个 runtime 文件的同一握手(该文件 24 个测试通过)。
