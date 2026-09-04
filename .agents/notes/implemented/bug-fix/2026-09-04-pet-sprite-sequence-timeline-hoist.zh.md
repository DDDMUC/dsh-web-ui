# Agent Note: dsh-pet sprite sequence animation hoists its per-frame tables

Status: implemented

## Problem

精灵帧循环的序列分支(manifest 定义的 `done`/`failed` 场景序列)在每个 rAF tick(约 60 Hz)重算时序状态:`sequenceFrameAt` 每次调用都分配新的逐条目时长数组并做两次 reduce,分支还用两次数组切片裁剪当前轨道,然后把结果丢掉。正下方的单轨道分支早已把 row/track 提升进 effect 作用域,注释直称逐帧重算是 "pure waste";序列分支只是从未获得同样的提升。

## Decision

`packages/dsh-pet/src/client/sequences.ts` 新增 `createSequenceTimeline(sequence, tracks)`,一次构建累计时长表并据此解析 `frameAt(elapsedMs)`;`sequenceFrameAt` 保留为基于新时间线的薄包装,公共助手语义不变。`PetSprite` 的帧循环 effect 现在在作用域内构建时间线与逐条目裁剪轨道表(animation -> row + trimmed track),tick 只读预计算表。帧下标依旧按完整轨道时长解析、再索引到裁剪后的 frames——与改动前相同,任何 manifest 下渲染帧不变。

## Alternatives considered

- **给 `sequenceFrameAt` 加可选预计算表参数**:否决——重载参数形状不如专用工厂易读,包装函数也让既有调用点与测试原样保留。
- **在 `sequenceFrameAt` 内按 sequence 身份做模块级记忆化**:否决——纯助手内藏模块级记忆状态令人意外;调用方的 effect 作用域才是表的正确归属。
- **只提升裁剪轨道、tick 内保留 `sequenceFrameAt`**:否决——解析器内的 map/reduce 才是主要分配来源,只消除一半浪费还会让循环更复杂。

## Consequences

- 序列阶段每帧零数组分配;单次解析成本约降一个数量级。
- `sequenceFrameAt` 继续可用且行为一致;其原有测试不变通过,另加等价性测试按动画速率采样钉住时间线与它的一致。

## Testing

- 实测(每臂 60,000 次解析,共 3 轮):逐调用助手每轮 10.1-27.0 ms,预构建时间线 0.5-4.8 ms——单次查询约 5-20 倍加速(中位约 19 倍),此外精灵循环每帧还省去两次数组切片。
- `src/client/sequences.test.ts`:新用例对 1.5 秒序列时间每 7 ms 采样钉住 `createSequenceTimeline` 与 `sequenceFrameAt` 的等价,并验证同表重复查询的确定性(4 个测试通过)。
- `src/client/PetSprite.test.tsx` 与 `src/client/index.test.tsx`:精灵循环行为不变(56 个测试通过)。
