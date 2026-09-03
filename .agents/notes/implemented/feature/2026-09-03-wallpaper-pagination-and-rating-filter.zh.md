# Agent Note: 皮肤中心 Wallpaper Engine 壁纸列表分页与内容分级筛选

Status: implemented

## Problem

在皮肤中心的 Wallpaper Engine 壁纸面板中，所有壁纸都显示在同一个网格列表中，仅提供每次递增 12 条的「加载更多」按钮。当用户在创意工坊订阅了几十乃至上百款壁纸时：
1. 缺乏精准分页导航与跳页能力，翻找壁纸体验繁琐且 DOM 节点持续累积。
2. Steam 创意工坊订阅的成人/敏感（R18/NSFW）壁纸与全年龄壁纸混排展示在缩略图网格中，在办公或多人共享环境下存在严重的社死风险。

## Decision

我们在数据层、路由层与 UI 展现层完整实现了 24 条/页的分页机制与年龄分级筛选：

1. **分级派生规则 (`we-library.ts`)**：
   - 权威解析 Wallpaper Engine `project.json` 中的 `contentrating` 字段（Everyone -> `g`，Questionable -> `pg13`，Mature -> `r18`）。
   - 字段缺失或异常时正则回退匹配标题关键词（`r-?18|nsfw|18\+` -> `r18`，`pg-?13|r-?16` -> `pg13`，其余归为 `g`）。
   - 在 `WallpaperEntry`、媒体合成条目、macOS 系统壁纸条目及 `/api/skin-center/we/inventory` 中完整透传 `rating`。
2. **筛选与分页 UI (`WallpaperPanel.tsx` 与 `skin-center.module.css`)**：
   - 分级筛选 Tab 栏：默认处于 G 级（全年龄安全模式），提供 `G`、`PG-13`、`R18` 选项。设计上特意取消「全部」选项，防止壁纸缩略图混排带来的曝光与社死风险。切换筛选立即重置到第 1 页。
   - 分页卡片网格：DOM 中仅挂载当前页的 24 条卡片，大幅降低资源占用。
   - 分级徽章：在缩略图右下角渲染分级徽章，R18 采用醒目高亮红底白字。
   - 分页导航条：上一页/下一页、带省略号的智能页码导航、总页数显示与直接跳页输入框。
3. **多语言对齐 (`locales.ts`)**：
   - 严格对齐添加 `wallpaperRatingAll`、`wallpaperRatingG`、`wallpaperRatingPg13`、`wallpaperRatingR18`、`wallpaperPagePrev`、`wallpaperPageNext`、`wallpaperPageJump`、`wallpaperPageTotal` 英文与中文键值。

域归属声明：依据仓库开发规范，涉及 Wallpaper Engine / 渲染器域的代码变更，在记录中同步通知该域协作者 Aa728848（EDDYCRAZY-CC）。

## Testing

- `packages/skins/skin-center/tests/we-library.spec.ts`：验证 `deriveRating` 对官方 `contentrating` 的解析以及标题正则回退逻辑；验证 `readProjectJson` 与 `scanProjectsRoot` 成功标记条目 `rating`。
- `packages/skins/skin-center/tests/wallpaper-panel.spec.tsx`：验证 24 条/页卡片切片挂载、上一页/下一页点击、页码按钮切换、跳页表单提交、分级筛选切换及 R18 醒目徽章展示。
- 门禁检查：`pnpm i18n:check`、`pnpm skin-center:check`、`pnpm typecheck`、`pnpm test`（`skin-center` 32 个测试套件、601 个测试用例全部通过）。

## Alternatives considered

- 保持无限向下滚动的加载更多模式。拒绝：在拥有海量壁纸时保留庞大的视频/Canvas DOM 节点会导致卡顿，且无法进行跳页定位。
- 仅在前端通过纯标题正则进行分级。拒绝：Wallpaper Engine 官方规范中 `project.json` 的 `contentrating` 才是最权威的元数据来源，标题正则仅作为兜底策略。

## Consequences

- 用户在浏览大型壁纸库时享有更流畅的分页体验与跳页定位能力。
- 敏感 R18/NSFW 壁纸可被一键过滤或醒目标记，有效避免日常使用与公共场合下的误展示风险。
