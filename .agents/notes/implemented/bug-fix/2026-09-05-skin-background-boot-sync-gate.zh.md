# Agent Note：皮肤中心背景启动同步门控

状态：已实现 (implemented)

## 问题背景

Issue #1375：Windows 上浏览器硬刷新后，皮肤中心五项背景滑杆全部归零，并把显式
0 写回 `skin-center-active.json`（文件 mtime 晚于刷新；`inputCardBlur: 0` /
`bubbleOpacity: 0` 不是默认值，说明存在一条客户端持有全 0 内存快照并整体提交
`background` 对象的写入路径）。macOS 同版本组合从不复现。

全仓只有皮肤中心客户端会提交整体 background POST（各 setter、scope 对账路径、
卸载 flush），所以 0 只能来自客户端自身内存状态。唯一可能携带显式 0 的状态层是
legacy `skin-background` 设置命名空间的用户层：被 #1107 之前 bug 波及的机器在该
层仍存着陈旧的 0 值，而 `migrateBackgroundFromSettings` 只做一次性复制、从不清除
该层。客户端 `reconcileScope` 在两种启动时序下都会把这层合并回权威 v2 状态：

1. 设置文档先于 v2 GET 完成：`!v2Loaded` 提前返回不记录该发布，GET 完成后同样的
   revision+内容被当成新编辑接受。
2. 设置文档晚于 v2 GET 到达：启动重同步与设置页真实编辑无法区分，直接被接受。

任一时序都会用陈旧 0 值 patch 在场值，随后 `persistBackground` 把整体清零快照写
回 v2 文件。legacy 用户层为空的机器（macOS 场景）永远命中
`currentUserJson === ''` 拒绝分支，所以从不复现。

## 决策

把启动时序处理收敛为 `core/background-scope.ts` 里的纯函数状态机
（`initialSkinBackgroundReconcileState` + `reconcileSkinBackgroundPublication`），
客户端胶水（`client/index.ts`）退化为薄封装。启动文档无论哪种时序都不再合并：

- v2 GET 完成前看到的发布只做记录，加载后的检查把它当作未变化的启动快照；
- 插件生命周期内第一个带 revision 的发布被一次性消费为启动同步，即使它晚于
  GET 到达——设置页真实编辑只可能发生在文档同步之后。

既有防护全部保留且行为不变：revision 门控、空用户层拒绝（#1184）、基于内容的
重放去重（#1109）、只合并显式存储的用户字段（#1107）。legacy 命名空间仍是官方
设置页的输入面，启动之后的编辑照常转发进 v2 存储。

## 后果

- 陈旧的 legacy 用户层无法再在启动时覆盖或落盘 v2 活跃状态；#1375 受影响用户
  需要重新设置一次数值（这些机器的文件里已经是 0）。
- 若设置页编辑恰好成为第一个带 revision 的发布（先于任何文档同步），该次编辑
  会被丢弃一次，下一次编辑正常生效。实际交互总是晚于文档同步。
- 客户端胶水状态从三个松散 `let` 变量收敛为一个类型化状态对象。

## 测试

- `tests/background-scope.spec.ts` 新增用例：启动文档先于 GET（两种时序）均不
  合并；带 revision 递增的 WS 重放仍被拒绝；启动同步后的真实编辑仍正常合并。
- `pnpm --filter @linxin666/dsh-client-ui-skin-center test`（33 个文件、607 项
  测试通过），包级 `typecheck` 干净，包级 `build` 重新生成 `lib/client.js` 与
  聚合包 `dsh-web-all/lib/client.js`。
