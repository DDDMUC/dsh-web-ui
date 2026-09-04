# Agent Note: dsh-pet asset routes stop recomputing per-request constants

Status: implemented

## Problem

宠物文件路由的每个请求都付两笔可避免的成本。其一,`containedRealpath` 对包含基准目录每次请求都跑一遍 `realpathSync`,而基准——registry 条目目录或 runtime 根——在处理器生命周期内是固定的(路由基于不可变快照一次性构建)。其二,资产处理器用 `entry.servable.includes(rel)` 匹配请求路径,这是对列表的线性扫描;完整 live2d 模型闭包轻易超过一百个文件,每个文件每次挂载都要经过这个处理器。

## Decision

`packages/dsh-pet/src/routes.ts` 把每个包含基准一次性解析进模块级 `REAL_BASE_CACHE`(以 registry 为界;只缓存成功,候选侧每次调用仍实解析),并在 `assetHandler` 构建时为每个条目建一个 servable 路径 `Set`,把每请求匹配变为 Set 探测。安全语义不变——进程内被重指向的符号链接基准目录在重启前 containment 直接失败,这是偏拒绝的安全方向;候选侧符号链接逃逸检查与之前完全一致。decoration 处理器保留两元素的 `includes`(那里用 Set 不划算)。

## Alternatives considered

- **处理器构建时预热全部条目的 realpath**:否决——为从未请求的宠物预付启动系统调用没有每请求收益,惰性填充达到同样的稳态。
- **连候选 realpath 一起缓存**:直接否决——候选必须保持实解析,逃逸检查才能看到新换的符号链接;缓存它等于为微秒级收益削弱安全边界。
- **把 registry 的 `servable` 本身改成 `Set`**:否决——`PetEntry.servable` 是包公开面,他处按数组消费(`petEntryView` 剥离、测试);重塑公开形态比处理器局部 Set 改动大得多。

## Consequences

- 每请求文件路由省一次 `realpathSync` 系统调用;live2d 资产路径把 O(闭包) 扫描换成 O(1) 探测。
- 一个模块级 Map 为每个宠物目录与 runtime 根持有一个 realpath,进程生命周期内不变。

## Testing

- 实测(共 3 轮):containment 20,000 次调用,无缓存 450-922 ms,基准缓存后 250-304 ms(约 1.8-3 倍;候选侧实解析按设计保留)。150 项 servable 列表探测,每 100,000 次 `includes` 71-96 ms,`Set.has` 0.2-0.7 ms(约 150-400 倍)。
- `tests/routes.spec.ts`、`tests/asset-security.spec.ts`、`tests/access.spec.ts` 的遍历、符号链接逃逸、上限与围栏断言原样通过(36 个测试),钉住安全行为未移动。
