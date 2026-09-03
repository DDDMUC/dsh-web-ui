# Agent Note: Blue Fantasy 皮肤 backdrop-filter 渲染性能优化

Status: implemented

## Problem

在使用 Blue Fantasy 皮肤并启用插画背景（如 whale-art.jpg）时，会话任务执行产生持续流式输出，任务管理器显示 CPU 和 GPU 占用率高达 80% 以上（Issue #1358）。

根本原因在于 `packages/skins/skin-center/skins/blue-fantasy/patches.css` 将全局 `backdrop-filter: blur(12px)` 挂载在根视口容器 `.aionui-root` 上。消息气泡流式接收 token 时的频繁重排重绘迫使浏览器对全屏背景大图反复进行昂贵的高斯模糊采样。

## Decision

1. 修改 `packages/skins/skin-center/skins/blue-fantasy/patches.css`，将 `.aionui-root` 从 `backdrop-filter: blur(12px)` 选择器中移除，仅保留侧边面板列（`[data-aionui-explorer-col], [data-aionui-preview-col]`）的磨砂效果。
2. 为侧边面板列添加 `contain: paint`，使主聊天流视图的 DOM 变化完全与侧栏图层隔离。
3. 运行 `node scripts/market-build` 重新生成工坊分发资源与样式包。

## Testing

- 运行 `pnpm market:check` 校验市场分发产物与哈希清单一致。
- 运行 `pnpm skin-center:check` 校验皮肤目录完整性。
- 运行 `pnpm --filter @linxin666/dsh-client-ui-skin-center test`（32 个测试套件、601 个单测全部通过）。

## Alternatives considered

- 完全移除皮肤中的所有 blur 效果。拒绝：弹窗和侧栏在图层隔离后保留轻量毛玻璃质感，对流式聊天无性能损耗。
- 在前端节流限制 token 渲染频率。拒绝：流式响应速度由宿主控制，从根源修复不当的全局 CSS 选择器才是最彻底且干净的解法。

## Consequences

- 任务执行期间聊天区域流式输出不再触发全屏高斯模糊重采样。
- 大幅压降 GPU / CPU 渲染开销与硬件发热。
