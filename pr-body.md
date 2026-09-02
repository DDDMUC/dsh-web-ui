> 提 PR 前请阅读 [CONTRIBUTING.md](../CONTRIBUTING.md) 与 [AGENTS.md](../AGENTS.md)；
> 提交信息用 Conventional Commits（`type(scope): subject`），禁止 emoji。

## 摘要（Summary）

新增皮肤「辉弦圣堂 · 菲比 (phoebe-atelier)」：《鸣潮》菲比主题的高定制皮肤。双立绘与光弦圣堂场景垫在对话区之下，象牙白大理石廊柱侧栏与月白圣金 token 重映射覆盖全部 dsw 语义变量；为加载、思考与工具运行状态预留光弦/光环动效钩子。角色形象为 AI 辅助同人再创作（CC BY-NC-SA 4.0，仅限非商业使用），作者自建分发仓库 [Theater-ahyeon/phoebe-atelier](https://github.com/Theater-ahyeon/phoebe-atelier)。

本 PR 已合并最新 `upstream/dev`（5c650db，v0.3.12 release run 之后），合并后重新生成 hook 注册表与 `market/dist`（目录现为 28 skins / 5 pets / 52 plugins，本皮肤收录在内）。

## 涉及包（Affected Packages）

- [x] 皮肤 / 皮肤中心 `packages/dsh-skins` / `packages/skins`
- [ ] 任务看板 `packages/dsh-task-board`
- [ ] Git 图谱 `packages/dsh-git-graph`
- [ ] 右侧面板 `packages/dsh-aionui-panel`
- [ ] 远程 Web UI `packages/dsh-remote-web-ui`
- [ ] SSH 远程运维 `packages/dsh-ssh`
- [ ] 宠物 `packages/dsh-pet`
- [ ] 聚合包 / 设置 `packages/dsh-web-all` / `packages/dsh-web-settings`
- [ ] 其他（请说明）

## PR 类别（PR Category）

- [ ] 壁纸 / 渲染器（Wallpaper Engine / WebGL / 背景场景）
- [x] 皮肤 / 皮肤中心（新皮肤收录、皮肤样式）
- [ ] 插件功能（任务看板 / Git 图谱 / 右侧面板 / 远程 Web UI / SSH / 宠物 / 设置 / 聚合包）
- [ ] 社区插件索引
- [ ] 维护 / 其他

## PR 类型（PR Type）

- [ ] 面向用户的功能或行为变更
- [ ] Bug 修复
- [ ] 视觉修复（UI / 视觉类问题的修复）
- [ ] 增强 / 优化（现有功能的改进、性能 / 体验优化）
- [x] 新皮肤收录（内容贡献，欢迎直接提交，无需先提 issue）
- [ ] 新宠物收录（内容贡献，欢迎直接提交，无需先提 issue）
- [ ] 维护 / 重构

## 最新代码确认（Latest Codebase Confirmation）

- [x] 我已基于最新 `dev` 分支开发，或在提交前已 rebase / 合并最新 `dev`。

已合并 `upstream/dev`（5c650db）并完成冲突解决与产物重建（合并提交 9dfd84d + 再生成提交 eb562ae）。

## 测试证据与上游同步（Test Evidence & Upstream Sync）

- [x] 我提供了自己本地测试的证据（执行的命令 / 测试结果 / 运行截图）。
- [x] 我已同步上游最新 `dev` 分支（`git fetch origin && git rebase origin/dev`），并附上同步后重新测试通过的证据（视觉 / 用户可见变更附截图）。

上游合并后重跑的全部命令与结果见下方「本地验证（Local Validation）」节。

## 视觉修复要求（Visual Fix Requirements）

本 PR 为新皮肤收录（非视觉修复类）；亮 / 暗试穿截图已附于「用户可见变更证据」。

## AI 编码披露（AI Coding Disclosure）

- [x] 完全 AI 编码：全部编程改动由 AI 产出，并由贡献者接受 / 审查。

使用的 AI 模型：GLM（多模态）

使用的编码 Agent 工具：ZCode CLI

## 仓库规范检查（Repo Rules）

- [x] 未修改 DSH 官方源码，仅基于官方 NPM SDK（`@deepseek-ai/*`）开发。
- [x] 未新增指向 DSH 源码 checkout 的 tsconfig `extends` / `paths` / `references`。
- [x] 新增目录位于 `packages/skins/skin-center/skins/phoebe-atelier/`（皮肤中心契约目录，非新建包）。
- [x] 所有新增 / 修改文件不含任何 emoji 字符。
- [x] 根 README「来源与版权」皮肤小节已追加条目（README.md 与 README.en.md 同步随本 PR 提交）。

## 贡献者版权声明（Contributor Copyright）

- [x] 已在根 README「来源与版权」皮肤小节追加：phoebe-atelier — Theater-ahyeon/phoebe-atelier，CC BY-NC-SA 4.0；角色「菲比」版权属库洛游戏（Kuro Games，《鸣潮》），AI 辅助同人再创作仅供非商业使用。

## 新皮肤收录（New Skin）

- [x] 纯资产目录契约：`packages/skins/skin-center/skins/phoebe-atelier/` 只含 skin.json + skin.css + hooks.mjs + assets/ + preview/ + LICENSE/NOTICE，无 package.json 与构建文件；`node scripts/dsh-skin validate` 通过；纯呈现层约束满足（不注入服务、不发事件、不触及模型请求，effect 销毁器完整还原）。
- [x] `skin.json` 符合 v2 清单（skinManifestVersion / id / name / nameEn / version / author / contributes / facets.client，另含 tagline / description / tags / accent / preview / order / license / licenseUrl / noticeUrl / sourceUrl / attribution）。
- [x] `pnpm skin-center:check` 通过（合并上游后重跑：28 repo catalog skins，本皮肤在目录中）；已重跑 `pnpm market:build` 并提交市场产物（`market/dist`，`dist up to date (454 files)`）。
- [x] 已用 `node scripts/capture-previews` 重拍并提交 `preview/{light,dark}.jpg`。
- [x] 根 README「来源与版权」条目、包内 LICENSE 与 NOTICE 齐全；PR 描述附市场试穿截图（亮 / 暗）。
- [x] 非低质皮肤：亮 / 暗双态样式完整（语义 token 全量重映射、双态背景图、双立绘资产、定制 hooks 动效层），非简单改色。

## 社区插件索引登记（Community Plugin Index）

不适用（本 PR 为新皮肤收录，未接入社区插件）。

## 本地验证（Local Validation）

执行的命令：

```bash
# 合并上游后（upstream/dev 5c650db），Windows + Node 24 + pnpm 11.24.0：
npx pnpm@11.24.0 install --frozen-lockfile --filter @linxin666/dsh-client-ui-skin-center...
node scripts/skin-hooks-registry.mjs
node scripts/skin-center-catalog-check --check
node scripts/dsh-skin validate packages/skins/skin-center/skins/phoebe-atelier
node scripts/market-build
node scripts/market-build --check
node scripts/capture-previews phoebe-atelier
node scripts/verify-docs.mjs
```

结果摘要：

- `skin-center-catalog-check --check` → `skin-center:check: check OK (28 repo catalog skins; package ships blue-fantasy only)`
- `dsh-skin validate` → `result: PASS`（仅 [class*=] 版本漂移提醒，与既有皮肤一致）
- `skin-hooks-registry.mjs` → 注册表重生成（本皮肤 hook 身份已入 `reviewed-hooks.generated.ts`）
- `market-build` → `wrote 1239 files (28 skins, 5 pets, 52 plugins)`；`--check` → `dist up to date (454 files)`
- `verify-docs.mjs` → `all documentation gates passed`
- 全部通过，无失败项。

## 用户可见变更证据（Local Feature Evidence）

证据：

市场静态试穿渲染（capture-previews 官方输出，已随 PR 提交于
`packages/skins/skin-center/skins/phoebe-atelier/preview/`）：

- 亮色：https://raw.githubusercontent.com/Theater-ahyeon/dsh-web/dev/packages/skins/skin-center/skins/phoebe-atelier/preview/light.jpg
- 暗色：https://raw.githubusercontent.com/Theater-ahyeon/dsh-web/dev/packages/skins/skin-center/skins/phoebe-atelier/preview/dark.jpg

含 hooks 驱动立绘层与全部装饰 DOM 的完整效果整页渲染（分发仓库，供审查参考）：

- 亮色落地页：https://raw.githubusercontent.com/Theater-ahyeon/phoebe-atelier/main/phoebe-atelier/preview/render-light-hero.png
- 暗色落地页：https://raw.githubusercontent.com/Theater-ahyeon/phoebe-atelier/main/phoebe-atelier/preview/render-dark-hero.png
