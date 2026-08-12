# Skin Center（GUI 内嵌皮肤中心）

`@deepseek-ai/dsh-client-ui-skin-center`（cordis 插件 id `ui-skin-center`）把皮肤列表/试穿/应用
内嵌进真实 dsh Web GUI 的插件配置页，作为「Web UI 插件」组里的一张卡片
（设置 → 插件配置 → Web UI 插件 → 皮肤中心），与 task-board / pet / live-stats 等
全家桶插件同一套槽位（`web-ui.plugin.item`），不占设置页一级导航。

- 列表：展示「官方默认」+ 仓库里全部皮肤（qq98 / ths / xp / blue-fantasy / dragon-heir /
  minecraft）的名称、tagline、强调色；当前激活的目标带 Active 标记。
- 试穿：点击「Try on」后真实执行该皮肤的 client bundle（走页面自己的
  `window.__ModuleLoader__` + `window.__DSH_MODULES__.import`，不是模拟器），chrome 立即生效；
  亮/暗切换走官方 theme 服务；「Exit try-on」完全还原——当前皮肤的样式、DOM、favicon、
  标题、body 内联样式全部恢复。「官方默认」也可试穿：点一下皮肤立即收回、回到官方外观预览。
- 互斥：试穿期间会按配方暂时收回当前激活皮肤的视觉写面（body 属性、背景内联样式、
  chrome 子节点、xp 的 footer taskbar），退出后原样恢复；同一时刻页面上只有一套皮肤。
- 应用：host 半区（`src/index.ts` + `src/routes.ts`）暴露 `/api/skin-center/apply`，
  点击「Apply / 恢复默认」即在服务端执行 `dsh-skin use <name>`（或 `use official`），
  写入 `~/.dsh/cordis.patch.yml` 后由 DSH 配置 watcher 秒级热载入，页面自动刷新生效——
  **无需重启 dsh web，无需复制命令**。应用失败时错误提示里附带终端兜底命令。
  host 依赖 `dsh-skin` CLI 在 PATH（`~/.local/bin/dsh-skin`，仓库 `scripts/dsh-skin`）。

## 安装（官方 plugin bundle 方式）

skin-center 是符合 DSH 官方插件标准的自包含 bundle（`dsh.bundle.patch` 指向
`cordis.patch.yml`，`prepare` 用专用 tsdown 配置自包含构建，无项目引用、无类型检查），
可按标准插件方式安装：

```sh
# 本地路径安装（lib/ 已预构建提交，可离线解析）
dsh plugin --profile <name> add /path/to/dsh-web-ui/skins/skin-center

# 或 git 安装（release 某个 commit 后指向它的 sha）
dsh plugin --profile <name> add github:<org>/dsh-web-ui#<sha>
```

> pnpm ≥10 安装 git 依赖前需先授权 `allowBuilds`（`prepare` 会原地构建），本地路径安装则无此要求。

- 需要皮肤插件们（qq98 / ths / xp / blue-fantasy）在宿主里也可解析时，skin-center 才能
  完整列出 / 试穿全部皮肤；skin-center 本身无互斥要求。

## 目录结构

```
skins/skin-center/
  package.json / tsdown.config.ts / tsconfig.json   # checkout 内构建所需的元数据
  src/index.ts                                       # host 侧：注册 /api/skin-center/* 路由
  src/routes.ts                                      # host 路由（代理 dsh-skin CLI）
  src/invariant.ts                                   # invariant 伴随插件（无断言）
  src/client/index.ts                                # apply：注册 Web UI 插件组卡片 + body 作用域
  src/client/SkinCenter.tsx                          # 卡片组件（官方默认 + 列表/试穿/亮暗/一键应用）
  src/client/try-on.ts                               # 试穿引擎（真实 loader + 互斥还原，含官方试穿）
  src/client/locales.ts                              # en/zh 文案
  src/client/skin-center.module.css                  # 面板样式（--dsw-* token，随皮肤自适应）
  src/client/generated/skins.ts                      # 生成：皮肤注册表 + 内嵌 bundle（勿手改）
```

## 机制要点

- 皮肤枚举：`generated/skins.ts` 由 `scripts/skin-center-bundles` 生成（读
  `skins/<name>/skin.json` + `lib/client.js`）。bundle 文本内嵌进皮肤中心自己的 client bundle，
  因为 `/plugins/<id>/client.js` 端点只为启用中的皮肤服务（禁用条目 404）。
- 试穿加载：`;(0, eval)(bundle)` 把 factory 注册到页面真实的 `__ModuleLoader__`；
  `window.__DSH_MODULES__.import(package)` 物化模块（CSS `<style data-plugin>` 自动注入）；
  `surface.apply(miniCtx)` 挂载，miniCtx 只实现 `effect(cb)`（皮肤唯一依赖）。
- 退出还原：先跑皮肤的 disposer（属性/chrome/favicon/标题/背景全撤回），再
  `invalidate(package)` + 删 style 标签，最后把激活皮肤的视觉快照原样恢复。
  官方默认试穿 = 同一套收回配方但不挂载任何皮肤，退出同样原样恢复。
- 激活皮肤检测：`window.__DSH_BOOT__.entries` 只含启用条目，与注册表 package 比对；
  无匹配即官方默认。
- 一键应用：host `/api/skin-center/apply` 代理 `dsh-skin use <name>` / `use official`
  （CLI 是 managed 区段与 symlink 的唯一权威）。DSH 长驻表面自带配置 watcher
  （`watchUserPatches` + config-only HMR），patch 写入后数秒热载入、无需重启；
  浏览器刷新页面取新 boot 图即生效（client 插件图行增删不在 `dsh-client-hmr` 语义内）。

## 构建（bundle 由 checkout 的 tsdown 预设产出）

皮肤中心与皮肤一样，在 DSH checkout 的 workspace 里构建（预设
`packages/client/tsdown.client.ts` 处理 CSS Modules 注入与平台外部化）。仓库内没有 tsdown，
所以按以下流程（或等价 worktree 流程）：

```sh
# 1. 重新生成内嵌注册表（皮肤 bundle/元数据变化后必须重跑）
node scripts/skin-center-bundles

# 2. 在 checkout 的临时 worktree 里构建
git -C ~/.dsh/source/current worktree add --detach /tmp/dsh-sc-build HEAD
cp -R skins/skin-center /tmp/dsh-sc-build/packages/client/ui-skin-center
cd /tmp/dsh-sc-build && pnpm install && pnpm --filter @deepseek-ai/dsh-client-ui-skin-center run bundle
cp -R packages/client/ui-skin-center/lib ../../code/dsh-web-ui/skins/skin-center/lib
cd ~/.dsh/source/current && git worktree remove --force /tmp/dsh-sc-build
```

## 安装（个人环境接线，不在 checkout 提交）

```sh
# 1. profile symlink（与 qq98/blue-fantasy 同款）
ln -sfn ~/code/dsh-web-ui/skins/skin-center \
  ~/.dsh/profiles/node_modules/@deepseek-ai/dsh-client-ui-skin-center

# 2. ~/.dsh/cordis.patch.yml 增加（放在 dsh-skin managed 段之外，勿动该段）：
#   - insert:
#       - id: ui-skin-center
#         name: '@deepseek-ai/dsh-client-ui-skin-center'

# 3. 配置 watcher 秒级热载入；刷新页面即在 插件配置 → Web UI 插件 组里看到皮肤中心卡片
```

## 试穿互斥的还原配方（try-on.ts）

| 皮肤 | body 属性 | 额外处理 |
| --- | --- | --- |
| 全部 | 收回 `bodyAttr`（CSS 失活） | 快照/清空 body 背景内联样式（blue-fantasy 鲸鱼背景）；摘除 body 直接子节点中非 `#root` 的 chrome（实测仅皮肤 chrome）；中性化观察器防幽灵写回 |
| xp | 同上 | 额外注入 neutralizer CSS 隐藏 sidebar footer 的 taskbar/开始按钮（其规则未按属性作用域） |

退出试穿 = 试穿皮肤 disposer（真实代码路径）→ 模块 invalidate + 样式清理 → 激活皮肤快照原样恢复。

## 验收对照（README 顶层契约）

- [x] 插件配置 → Web UI 插件 组里出现皮肤中心卡片，无 console 报错
- [x] 列表含官方默认 + 全部皮肤，当前激活有标记
- [x] 试穿真实生效（chrome/背景/标题/favicon），亮/暗正确；官方默认可试穿
- [x] 退出完全还原；互斥（不出现两套标题栏）
- [x] 一键应用：host API 执行 `dsh-skin use`，watcher 热载入，页面自动刷新生效（无重启）；失败附命令兜底
- [x] 回归：dsh-skin CLI（含 `use official`）、网页 Gallery、官方 GUI 不受影响
- [x] e2e 截图见 `docs/e2e/skin-center/`
