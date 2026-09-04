# Agent Note: dsh-pet store skips the poll publish when the snapshot is unchanged

Status: implemented

## Problem

`pollNow` 每 2 秒把 `/api/pet/state` 的响应无条件发布进宠物 store,每次发布都写入一个新快照对象。下游每次 store 通知都会驱动 useSyncExternalStore 桥,于是空闲宠物(phase、气泡、好感度、显示配置完全相同——最常见的稳态)在标签页可见期间仍以 0.5 Hz 重渲染整个精灵门户——精灵框、气泡栈、悬停面板、HUD 槽位。

## Decision

`packages/dsh-pet/src/client/pet-store.ts` 的 `setSnapshot` 现在在 store 已 `ready`、无错误且新快照与当前快照内容相等时直接返回、不写入。引擎栈让这次跳过精确成立:immer 零修改时 `produce` 返回同一状态对象,zustand vanilla `setState` 在状态同一时不通知——没有任何订阅者触发,React 重读到同一快照并保拍。相等性用 JSON 字符串比较而非字段枚举:精确匹配是跳过的唯一途径,漏一个字段的代价只是多一次本优化要省的渲染,绝不会冻结宠物画面。要紧的迁移照常发布——首个快照、错误到恢复、任何内容变化。

## Alternatives considered

- **逐字段结构相等**:否决——枚举器漏掉未来 `PetStateView` 新字段会把该字段的 UI 冻结;JSON 比较按构造是完备的,且载荷很小(0.5 Hz 比较)。
- **在 `client/index.ts` 的轮询处跳过**:否决——store 是所有发布方(轮询、交互、可见性恢复)共用的写边界;在写边界防护覆盖全部入口,apply body 也保持简单。
- **在 store 引擎里对通知做去抖**:否决——那是所有插件共用的引擎面(`dsh-client-store`),批处理会延迟真实更新而不是消除空操作。

## Consequences

- 空闲宠物每个轮询 tick 只付一次 JSON stringify,React 工作为零;任何真实变化照旧精确发布。
- 跳过按构造不可见:它只会放弃对相同状态的一次渲染,绝不放弃对新状态的渲染。

## Testing

- 经真实引擎实测(zustand + immer,无 mock):`src/client/pet-store.test.ts` 钉住订阅者通知次数——连续三个相同快照恰好通知一次,错误状态下相同载荷的恢复照常发布,gameplay/feedback 补丁落在被跳过的轮询之上(3 个测试)。
- `src/client/index.test.tsx` 经 apply body 行使 store action 后依旧通过(6 个测试)。
