# Agent Note：2026-09-03 维护运行（合入两个文案 PR，phoebe-atelier 皮肤因选择器基座受阻）

Status: implemented
Archived: 2026-09-04

## Problem

对 `zhu1090093659/dsh-web` 的例行 PR 维护共发现七个分配给 `zhu1090093659`
的开放 PR。两个纯文案的社区条目 PR（#1333 dsh-session-insights、#1334
dsh-completion-guard）仅被过期 head 上的红色 CI 阻塞（早于 09-01 的 dev CI
修复）。#1349 是带 hooks 的新皮肤（phoebe-atelier），尚未评审。另有四个 PR
（#1321、#1318、#1306、#1144）在维护者 CHANGES_REQUESTED 之后无新提交，
仍在等作者。

## Decision

- **#1333 与 #1334 合入。** 核对 diff 为纯描述文案更新，且
  `community.json` 与再生的 `market/dist/manifest/plugins.json` 内容一致。
  两个 fork head 都允许维护者编辑，用 `gh pr update-branch` 把分支更新到
  修复后的 dev，CI 全绿（未用 admin 绕过），随后批准并 rebase 合入。
- **#1349（phoebe-atelier）CHANGES_REQUESTED**，给出三项基于 PR head
  实测的问题：
  1. 阻塞：`skin.css` 约 511 条选择器中约 470 条以
     `body[data-dsh-phoebe-atelier]` 为基座，而该属性只有皮肤自己的
     hooks 才会设置。契约要求作者以 `:root` / `body[data-ds-dark-theme]`
     为基座（加载器在 hooks 之前通过 `html[data-dsh-skin="<id>"]` 作用
     域化）。实测后果：市场模拟器（`preview.html?skin=phoebe-atelier`）
     注入了 155KB 的样式表但渲染的是官方默认主题——模拟器不执行 hooks；
     同样条件下 maid-atelier 完整渲染。dsh-market.com 的试穿页就是这个
     模拟器。css 里的 url() 兜底还写成了 market 构建路径
     （`assets/skins/phoebe-atelier/assets/...`），在皮肤中心上下文是死
     路径。
  2. 阻塞：reviewed-hooks 注册表两个半边不一致——
     `src/reviewed-hooks.generated.ts` 与实际文件一致（manifest
     76cfe0d3…、hooks f39b57db…，shasum 校验过），而已提交的
     `lib/index.js` 还是旧值（830b56be… / 89df9a23…）。最后的
     "refresh to lf bytes" 提交只重建了 src 侧；`provenance.ts` 运行时
     按 lib 侧的表校验，发布包里该皮肤的 hooks 会被判为未审核。与 #1316
     事故同类（lib 过期）。
  3. 清理项：仓库根目录误提交了草稿 `pr-body.md`。
  视觉审查通过：亮暗 preview 与最终皮肤状态一致，暗色光环放大检查无裁
  切框（像素步进扫描只有自然的辉光衰减）。hooks.mjs 本身干净：纯 DOM
  装饰，无网络/存储/eval，清理挂在 ctx.onCleanup 上。
- **#1144（dsh-deepsea）按用户常设规则关闭**（超过 7 天无新提交的 PR 关
  闭）：最后提交 08-25，CHANGES_REQUESTED（上游干净 clone 测试/typecheck
  可复现失败、缺 CI、缺联网隐私开关与授权边界）之后静默 9 天。已留言
  上游补齐后欢迎重新提交。
- **#1349 后续与合入**：作者当晚推送 24c3061ea，三项问题全部修复
  （选择器基座改挂 `:root`，`body[data-dsh-phoebe-atelier]` 清零；lib
  注册表 hash 与实际文件一致；pr-body.md 已删；url() 兜底改回皮肤相对
  路径）。在预览模拟器复测：亮暗两态都正确渲染换肤（此前两态全是默认
  主题）；用 maid-atelier 对照发现其暗色侧栏在亮色主题下仍可读，而
  phoebe 的象牙侧栏在没有 hooks 面板衬底时文字对比度偏低——已作为非
  阻塞观察告知作者。服务端 `--rebase` 合并在 market/dist 生成产物上冲
  突（dev 侧重建过 tryon 分块哈希），改用 merge commit 合入
  （48f62252a）；合入后 dev 上 `market:check` 直接通过，无需再生成。
  首次 dev CI 失败了 dsh-task-board 一个僵尸进程测试，本地复跑 31/31
  全过——与合并无关的 CI 时序 flake，重跑失败 job 后全绿。
- **#1321、#1318、#1306**：只读确认——维护者评审后无新提交（仅 2-3
  天），不重复评审，无远程操作。

## Consequences

- dsh-session-insights 与 dsh-completion-guard 的商店文案在 dev 上已是
  白话版本，phoebe-atelier 已合入皮肤目录（dev 合并提交 48f62252a）。
- 「7 天无提交关闭」的常设规则已开始执行，#1144 是第一个关闭案例。
- 评审带 hooks 的皮肤时应先打开
  `market/dist/preview.html?skin=<id>`：它是文档化的验收门，也是唯一能
  暴露 hooks 依赖选择器基座的场景——真实 GUI 截图里 hooks 必然已运行。

## Alternatives considered

- **对 #1333/#1334 直接 admin 合入、不更新分支**（09-01 处理维护者侧
  dist 缺口的先例）：本次弃用，因为两个 fork 都允许维护者编辑，能拿到
  更新后 head 的真实绿灯，证据更强。
- **维护者代改 #1349 的选择器基座**：弃用；重挂约 470 条选择器属于作者
  的设计改造，且作者下一次推送也会使维护者侧的注册表重建失效。
- **静默合入 #1349、靠 hooks 撑起皮肤**：弃用；试穿页是商店的门面，
  且 provenance 不一致本来就会禁用 hooks。
- **#1349 走 rebase 合入（仓库常规 PR 形态）**：服务端 rebase 在
  market/dist 生成产物上冲突；本地解决意味着要在临时 worktree 里搭
  完整 market-build 工具链。merge commit 加上通过的 `market:check`
  以零成本得到同样经过验证的树。
- **把 task-board 的 CI 失败当成合并回归**：本地复跑 31/31 全过后
  弃用；该用例会拉起真实进程，僵尸检测的时序对环境敏感。
