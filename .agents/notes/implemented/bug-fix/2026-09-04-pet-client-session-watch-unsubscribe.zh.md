# Agent Note: dsh-pet client unsubscribes the session watch on UI teardown

Status: implemented

## Problem

浏览器半区保留一个 `sessions.list` 订阅('pet: current-session watch' effect),让当前会话切换时立即重排气泡栈,而不必等 2 秒轮询。`disposeUi`——设置开关、`killUi` 与 bundle 接管共用的拆除路径——会停止轮询 interval 并卸载 React root,却从未退订该 watch。用户在设置里关掉宠物后,后续每次会话 store 通知仍会在页面余生持续触发 `pollNow()`:一次 `/api/pet/state` 请求(外加 `/api/pet/pets` 重试)写入一个 React 树早已卸载的 store。只有整个插件 fiber 销毁才能释放该订阅。

## Decision

`packages/dsh-pet/src/client/index.ts` 的 `disposeUi` 现在与 `disposePoll()` 一起调用 `disposeSessionWatch()`。watch 跟随 UI 生命周期:设置关闭、终局拆除(issue #785 的接管)与 fiber 销毁都会让 sessions 监听归零;重新启用宠物时随新 UI 挂载新的 watch。

## Alternatives considered

- **把订阅收窄为仅当前会话变化**:否决作为主修复——这里使用的 sessions store 接口没有选择器 API,且列表通知上的无效 RPC 频率是与泄漏无关的另一个问题;在没有实测频率证据前给该路径加节流会改变刷新语义。
- **并入轮询 effect('pet: poll')内订阅**:否决——watch 与轮询意图不同(气泡立即重排 vs 2 秒节奏),合并会把生命周期测试分别推理的两个 effect 耦合起来。

## Consequences

- 关闭宠物后所有宠物驱动的网络活动停止;卸载的 store 不再有任何 sessions 监听。
- effect 清理仍注册在 fiber 层,手动退订与 fiber 层退订保持幂等(set 成员删除),与既有 'pet: poll' 纪律一致。

## Testing

- `packages/dsh-pet/src/client/index.test.tsx`:fake context 现在统计存活的 `sessions.list` 监听数;新增测试钉住设置关闭时的退订与重新启用时的新订阅(该文件 6 个测试通过)。
