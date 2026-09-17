# Agent Note: 用量侧栏控件落位入口行

Status: implemented

承接 [issue batch 1587-1600](2026-09-16-issue-batch-1587-1600-fixes.md)：该记录交付的 #1592 侧栏面让面板自带头部；本记录记载控件布局修复，并同步更新该记录中的面板事实。

## Problem

#1592 的侧栏用量面叠了两行「用量」：注入的入口行（仪表图标 + 文案）和面板自己的头部（标题 + 刷新 + 折叠）。同时还存在两套折叠机制——点入口行隐藏整个面板容器（不持久化，刷新页面即丢失），面板头部的「折叠」按钮只收起面板体（持久化到 localStorage）。重复的头部读起来就是坏掉的 UX，而且在窄轨栏里，一旦面板头部滚出视野，刷新控件也随之消失。

## Decision

1. 共享 sidebar-entry core（`shared/client/sidebar-entry-core.ts`）新增可选 `actions` 数组：落位行右缘的尾部按钮。带 actions 的行切换为复合结构——容器 div 内放一个主按钮（图标 + 文案，即开关命中区）加各动作按钮——因为嵌套交互元素不是合法 HTML。不带 actions 的行保持经典单按钮结构逐字节不变，dsh-ssh、dsh-task-board、dsh-skill-explorer 渲染出的行完全不受影响。每个动作携带稳定的 `data-dsh-entry-action` id、本地化标签（aria-label + title）、可选的非激活态图标（设置后该动作成为状态镜像：每次激活态变化时换图标并打 aria-expanded），以及一个收到按钮本身的点击处理器（用于冷却等瞬态反馈）。
2. dsh-usage 把控件落位入口行：刷新命令（环形箭头字形，3 秒冷却以旋转图标呈现）与折叠箭头（展开时朝下、折叠时朝右，本地化的 折叠/展开 标签，带 aria-expanded）。行主区与箭头都触发展开/收起；点击行内边距同样触发，保留旧的整行命中区。
3. 单一 open 状态取代两套折叠机制。面板 mount 拥有它：从 `localStorage`（`dsh-usage.sidebar.collapsed`，键不变）初始化，由入口行控件翻转，每次翻转持久化，并经同一个 subscribe/isOpen 面同时镜像给 React 面板体与入口行。面板只渲染内容——展开时是配额/余额面板体，折叠时是当前提供方的今日摘要条（见[宠物解耦笔记](../simplification/2026-09-17-usage-pet-decoupling-collapsed-summary.md)）——轮询节奏为展开 10 秒、折叠 30 秒，页面隐藏时暂停。旧面板头部、它的本地折叠状态与 `usage.sidebar.title` 文案一并移除（zh/en/ru 三语字典同步更新）。

## Alternatives considered

- 保留面板头部只做样式修补。否决：一个小表面挂两个头部，无论怎么排版都依旧混乱；控件本就该在用户已经看到的那一行上。
- 把动作按钮塞进经典单按钮行内。否决：按钮套按钮不是合法 HTML，而且点击路由（到底谁触发）在 shell 重渲染下会很脆。
- 在 dsh-usage 内部分叉一份 entry core。否决：生成的副本注定漂移；条件式复合结构让兄弟包逐字节不变，API 只存在一处。
- 行上用文字按钮（刷新/折叠）。否决：侧栏的惯例是图标按钮（工作区头部同样落位搜索/筛选字形），文字会挤爆 36px 高的导航行。

## Consequences

- 四个同步副本的 entry core 都带上 actions API；只有 dsh-usage 选用，其余三个包的行、测试与窄轨行为不变。
- 56px 折叠窄轨隐藏动作按钮（入口行回到纯仪表图标），而且行高亮与箭头现在实时更新：入口的 active 桥之前传的是空 subscribe，高亮只反映挂载时刻的状态。
- 面板折叠时刷新控件仍可用；折叠选择经单一状态在重载后保留。
- 环境备注：Node >= 23 下运行时自带的无 flag `localStorage` 会在 vitest 里遮蔽 jsdom 的 Storage（`getWindowKeys` 保留已存在的全局），于是任何触碰 `window.localStorage` 的测试在本机挂掉而 CI（Node 22）保持绿色；`tests/sidebar-panel-mount.spec.ts` 在真 Storage 缺失时安装一个符合标准形态的内存 Storage。CI 用 Node 22，因此这只是本机 shim。

## Testing

- `packages/dsh-usage/tests/sidebar-entry.spec.ts`：入口行落位两个本地化控件；刷新强制一次探测周期并冷却按钮；箭头与主区点击触发展开/收起；箭头镜像折叠/展开（图标、标签、aria-expanded）。
- `packages/dsh-usage/tests/sidebar-panel-mount.spec.ts`：折叠选择跨重挂载持久化（同一 localStorage 键）；订阅者收到新状态通知；容器始终落位入口行正后方。
- `packages/dsh-usage/tests/sidebar-panel.spec.tsx`：按「只渲染内容」的重写——渲染、空/错误状态、折叠摘要条、仅页面隐藏才暂停的轮询。
- 门禁：`pnpm --filter @linxin666/dsh-usage test` 与 `typecheck`、仓库 `pnpm typecheck`、`pnpm test:standards`（为 dev 同步带入的既有负债重新记录基线）、`pnpm i18n:check`、`pnpm emoji:check`、`node scripts/sync-shared.mjs --check`，外加 dsh-web-all 重建与 lib 指纹门禁。
