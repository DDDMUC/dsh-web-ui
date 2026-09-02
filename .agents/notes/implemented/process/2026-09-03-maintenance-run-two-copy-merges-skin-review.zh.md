# Agent Note：2026-09-03 维护运行（合入两个文案 PR，phoebe-atelier 皮肤因选择器基座受阻）

Status: implemented

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
- **#1321、#1318、#1306、#1144**：只读确认——维护者评审后无新提交，
  不重复评审，无远程操作。

## Consequences

- dsh-session-insights 与 dsh-completion-guard 的商店文案在 dev 上已是
  白话版本。
- phoebe-atelier 的修复属于作者（样式表基座的实质性改造，不适合维护者
  代改）；注册表/lib 重建与杂散文件删除随其下一次更新一并处理。
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
