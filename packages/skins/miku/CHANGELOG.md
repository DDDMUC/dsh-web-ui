# Changelog

## 0.1.12 — 视觉全面优化（主题更新）

### 新增
- 初音光标：全界面鼠标指针变为初音图标（32x32，热点对准尖端；`dsh.miku.cursor=off` 可关闭）
- 配置项：`dsh.miku.title`（标题栏文字）、`dsh.miku.cells`（状态栏文字）、`dsh.miku.cursor`（光标开关）
- Safari 适配：支持 `prefers-reduced-transparency`（系统开启"降低透明度"时自动去掉毛玻璃，省 GPU 开销）

### 优化
- 背景图替换：使用用户提供的初音图（2560x1440，高质量 WebP 内嵌，无静态资源）
- 透明化：左侧导航栏、文件树 / 预览面板、对话区、输入框全部改为毛玻璃（半透明 + blur），背景图透出
- 文字配色：浅色主题正文恢复深墨色文字（WCAG AA 对比度），Miku 蓝保留为强调色；输入框文字深墨色
- 输入框：高不透明度浅色毛玻璃底（`rgba(250,253,255,0.92)` + blur），深墨文字在背景图任意区域都可读
- 按钮：主操作按钮改为实心 Miku 蓝渐变 + 白字，次要按钮为浅蓝底 + 深蓝字 + 细边框
- 拖拽分隔条：去掉白色边框与白条，命中区透明，仅保留 Miku 蓝分割线
- 状态栏：背景改为与标题栏一致的蓝紫洋红渐变，文字白色
- 设置界面：亮 / 暗主题统一为深蓝毛玻璃
- Safari 适配：`prefers-reduced-transparency` 下除移除毛玻璃外，为关键表面补近不透明实底

### 修复
- 修复全局 `* { border-radius: 6px }` 覆盖标题栏按钮 / 状态栏单元格精确圆角的问题
- 修复 CSS 中重复的 scrollBody 规则（合并去重）

### 说明
- 光标素材来源：用户提供的 Windows 光标包（Moos柚眠），已获作者书面授权（分发 + 抽帧缩放二改 + 随包许可允许的下游商用）
- 背景图：贡献者提供的初音未来同人图，已获作者书面授权（分发 + WebP 重编码 + 随包许可允许的下游商用）

---

# Changelog (English)

## 0.1.12 — Visual overhaul (theme update)

### Added
- Miku cursor: the whole window pointer becomes a Hatsune Miku icon (32x32, hotspot at the tip; `dsh.miku.cursor=off` disables it)
- Config keys: `dsh.miku.title` (title text), `dsh.miku.cells` (status text), `dsh.miku.cursor` (cursor toggle)
- Safari support: `prefers-reduced-transparency` (frosted glass degrades to plain fills when the system reduces transparency)

### Improved
- Backdrop replaced with the user's Miku image (2560x1440, high-quality WebP inlined; no static assets)
- Transparency: sidebar, explorer/preview panes, conversation and inputs are now frosted glass (translucent + blur); the art glows through
- Text colors: light-theme body text restored to deep ink (WCAG AA contrast); Miku blue stays an accent; input text is deep ink
- Inputs: high-opacity pale frosted fill (`rgba(250,253,255,0.92)` + blur) so deep-ink text stays readable over any backdrop area
- Buttons: primary actions use a solid Miku-blue gradient with white text; secondary buttons are pale blue fill with deep-blue ink and a hairline border
- Drag handles: white borders/bands removed; transparent hit zone with a Miku-blue divider line
- Status bar: background now matches the title bar's blue-violet-magenta gradient with white text
- Settings: both themes share the same deep-blue frosted glass
- Safari: `prefers-reduced-transparency` also raises the key surfaces to near-opaque fills, not just dropping the blur

### Fixed
- Global `* { border-radius: 6px }` no longer overrides the precise corner radii of title-bar buttons / status cells
- Duplicate scrollBody rules merged

### Note
- Cursor artwork source: the user's Windows cursor pack (Moos柚眠); written authorization obtained from the author covering redistribution, frame-extraction resizing, and downstream commercial use under the package license
- Backdrop: Hatsune Miku fan art supplied by the contributor; written authorization obtained covering redistribution, WebP re-encoding, and downstream commercial use under the package license
