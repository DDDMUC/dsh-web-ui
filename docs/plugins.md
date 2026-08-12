# 如何把新插件加入全家桶

本指南说明如何把一个新插件加入 dsh-web-ui 全家桶，使其可以被聚合插件包（`web-ui-all` / `dsh-skins`）一键装齐，也可独立安装。

## 流程

### 1. 脚手架生成

```sh
node scripts/dsh-plugin-new <name>
```

在 `packages/<name>/` 生成标准 bundle 骨架（`<name>` 限小写字母、数字、单连字符，如 `task-board`），并替换模板中的 `__NAME__` 占位。生成的结构：

```text
packages/<name>/
├── cordis.patch.yml   # 插件行（- insert: - id: ui-<name> / name: ...）
├── package.json       # dsh.bundle.patch 清单 + dsh.client 声明
├── src/
│   ├── index.ts       # host 半区（node 进程侧）
│   └── client.ts      # browser 半区（Web GUI 侧）
├── tsconfig.json
├── tsdown.config.ts
└── README.md
```

### 2. 实现插件逻辑

- host 半区 `src/index.ts`：导出 cordis 插件，运行在 dsh host 进程（例如系统提示词公告、真实任务执行等）。
- browser 半区 `src/client.ts`：Web GUI 侧的 UI 逻辑，经 package.json 的 `dsh.client` 声明注入运行时。
- 形态参照 `packages/task-board/`：`dsh.bundle.patch` 指向包内 `cordis.patch.yml`；`dsh.client` 声明 `inject: ["@deepseek-ai/dsh-client-runtime"]` 与 `platform: "web"`。

### 3. 注册进聚合包

把 `- ../<name>` 追加到 `packages/web-ui-all/aggregate.yml` 的 `patchFrom` 和 `deps` 两段：

- `patchFrom`：该包的 `cordis.patch.yml` insert 行会被汇总进聚合包 patch；
- `deps`：解析为包名写入聚合包 `package.json` 的 `dependencies`（`workspace:*`）。

若新插件属皮肤类，改加入 `packages/dsh-skins/aggregate.yml`。皮肤启用互斥由 `dsh-skin use` 管理（`~/.dsh/cordis.patch.yml` managed 区段），因此皮肤包只进 `deps`、不进 `patchFrom`。

### 4. 重新生成聚合包

```sh
node scripts/aggregate.mjs          # 重新生成聚合包 cordis.patch.yml + 依赖
node scripts/aggregate.mjs --check  # 校验模式：任何漂移以退出码 1 报错（CI 用）
```

### 5. 构建验证

```sh
pnpm install   # workspace 链接（packages/* 与 packages/skins/*）
pnpm -r build  # 全仓构建
```

> **前置要求**：构建/类型检查/测试依赖 DSH checkout 提供类型来源——`~/code/test-zhu1090093659`
> （peer API 源码，即下文「类型引用」的 `../../../test-zhu1090093659` 相对路径）与
> `~/.dsh/source/current`（dsh 运行时类型，见 `packages/task-board/tsconfig.json` 的 paths）。
> 缺失时 `pnpm -r build` / `pnpm typecheck` 会失败。

### 6. 本地验证

```sh
dsh plugin --profile web add link:<dsh-web-ui>/packages/web-ui-all
```

重启 `dsh web`，确认聚合包插件行挂载生效。调试阶段也可先单独安装单包（`link:<dsh-web-ui>/packages/<name>`）验证。

## 第三方插件准入原则

家族仓库欢迎社区插件，但收编必须透明：

1. **活跃且有上游的第三方 → 不搬代码**。优先 fork 到 dsh-external 组织维护（保留上游关联，可随时 merge 上游更新），或作为依赖引用；全家桶只注册其安装入口。
2. **收编条件**（无活跃上游、上游已停更、或作者明确授权组织托管）：
   - 用 `git subtree add` 迁入，保留完整 git 历史；
   - **必须**保留上游 LICENSE 文件与作者署名（包内 LICENSE、README 作者声明）；
   - 在包 README 记录来源仓库与迁移日期；
   - 版权归原作者，本仓库仅托管，不主张版权。
3. **合规红线**：无 LICENSE、作者未授权、或版权归属不明的代码，一律不收编。

## 插件规范要点

- **package.json 的 `dsh.bundle.patch` 声明**：指向包内 `cordis.patch.yml`，这是官方 bundle 清单，`dsh plugin` 依赖它识别与挂载插件。
- **cordis.patch.yml insert 行格式**：

```yaml
- insert:
    - id: ui-<name>
      name: '@deepseek-ai/dsh-client-ui-<name>'
```

- **类型引用**：统一走 `../../../test-zhu1090093659`（从 `packages/<name>/` 出发的相对路径，参照 `packages/pet/tsconfig.json` 的 project references；`~/.dsh/source/current` 绝对路径亦可，参照 `packages/task-board/tsconfig.json` 的 paths）。当前 DSH 快照（20260811 起）将 vendored cordis 包名从 `cordis` 改为 `@deepseek-ai/cordis`：源码 `import ... from '@deepseek-ai/cordis'`，tsconfig `paths` 键同名（`test-zhu1090093659/tsconfig.base.json` 同时保留两个拼写指同一源码，兼容旧引用）；`cordis` 不再出现在任何 package.json 的依赖/peer 声明中（运行时由 dsh profile 提供，tsdown 的 node 半区显式 `external: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-settings']`）。
- **设置页插件配置（20260811+ 可选能力）**：DSH web 设置的「插件配置」区（`ui-plugin-config` 注册的 `settings.section`）展示每插件一张卡片（`settings.plugin.item` 槽）。插件接入只需两步：
  1. **host 半区**：`installSettingsSection(ctx, settingsNamespace('<ns>'), <z-schema>, <composition entry>, { setSource, onChange })`（`@deepseek-ai/dsh-settings`）注册命名空间；`setSource` 注入动态读取器，`onChange` 让已派生的行为跟随已提交的修改，无需重启。
  2. **browser 半区**：注入 `settingsScope`（`@deepseek-ai/dsh-client-ui-settings` 提供 `ctx.settingsScope`），`ctx.settingsScope.bind({ namespace })` 读写该命名空间，并注册 `settings.plugin.item` 卡片（自行 `declare module '@deepseek-ai/dsh-client-ui-slots'` 声明该槽，shape 与 `ui-plugin-config` 一致；slot `order` 用 100+ 避开内置卡片）。样板实现见 `packages/remote-web-ui`（`src/client/settings-form.ts` + `PluginSettingsCard.tsx` + `*SettingsCard.tsx`，自包含的 staged 表单，不依赖兄弟 UI 包）。
- **皮肤类插件**：改用 `scripts/dsh-skin-new` 脚手架（皮肤规范见 skin-center / 各皮肤包 README），不经过本流程第 3-4 步的 `web-ui-all` 注册。
