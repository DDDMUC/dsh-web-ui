# SDK 0.1.0-rc.7 -> 0.1.0-rc.8 升级验证快照（2026-08-19）

冻结记录 dsh-web-ui 官方 SDK cohort 升级的验收证据。历史快照，不修改长期文档。

## Cohort 矩阵

| 项 | 基线 | 目标 |
| --- | --- | --- |
| 官方 channel | npm latest（rc.7） | npm next（0.1.0-rc.8，2026-08-19T15:41Z 发布） |
| @deepseek-ai/dsh-* | ^0.1.0-rc.7（26 个 devDeps） | ^0.1.0-rc.8 |
| cordis | ^4.0.1 | ^4.0.1（不变） |
| cordis-plugin-include / loader | ^1.0.6 / ^1.0.2 | 不变 |
| schemastery | ^3.18.0 | 不变 |
| 宿主 dsh CLI | 0.1.0-rc.7 | 0.1.0-rc.8（npm 全局安装） |

## 变更文件

- 15 个包 package.json + shared + plugin-template：devDeps rc.7 -> rc.8；
- pnpm-workspace.yaml：45 条 minimumReleaseAgeExclude rc.7 -> rc.8；
- pnpm-lock.yaml：pnpm 重新解析（rc.7 残留 0 处）；
- shared/web-platform.ts：平台种子表对齐 rc.8 shell 冻结模块表
  （移除 dsh-client-web-react / dsh-client-schema-form；rc.8 表恰为
  react、react/jsx-runtime、react-dom、react-dom/client、cordis、
  dsh-client-ui-slots、dsh-client-ui-primitives，证据：dsh-web-frontend@rc.8
  dist staticModules）；
- packages/AGENTS.md、packages/dsh-git-graph/AGENTS.md：种子表成员引用更新；
- skin-center semantic-adapter 注释 + 再生 bundle；
- dsh-tool-describe-image 测试 fixture：补 rc.8 新增必填字段
  maxImageDimension（宿主默认 2000，证据：dsh-attachment-local@rc.8）；
- 新增持久契约：shared/tests/web-platform.test.ts（种子表 = rc.8 shell 表）、
  scripts/inject-contract.test.mjs（全仓 inject 集合 = 8 个 rc.8 模块）。

## 验证账本（分支 chore/sdk-upgrade-rc8 @ ac2b0377b，基于 origin/main e17044b6f）

全部通过：typecheck / test / test:scripts / build / runtime-deps:check /
gallery:check / skin-center:check / community:check / aggregate:check /
docs:check；git diff --check 干净；diff 内无源码 checkout 路径、无外部本地
链接、无 token。

## 关键 delta 分类（rc.7 -> rc.8，官方 tarball 对照）

- packaging-only：dsh-settings / dsh-host-webserver / dsh-system-prompt /
  dsh-client-ui-slots / dsh-tools / dsh-scope / dsh-timeout（d.ts 逐字节相同）。
- 上游破坏但本仓不消费：dsh-client-ui-settings 值导出移除
  （SettingsScopeBinder/Controller -> type-only）、构造器签名变更、load() 移除；
  dsh-client-ui-conversation loadImage 移除 / sendSession 返回类型变更；
  dsh-host-apiproxy host.describe 增必填 home。
- 消费面行为变化（GUI 实测项）：dsh-client-locale 回退链 zh -> en；
  dsh-client-ui-settings settingsScope 内部镜像重构（bind 不变）。
- 上游打包缺陷：rc.8 包发布 sourceMappingURL 注释但不发布 .map（测试/开发
  工具噪音，不影响运行时；shared/vitest.config.ts 已 sourcemapIgnoreList）。
- 既有 flake（非 rc.8 回归）：dsh-ssh panel-hosts 测试 teardown 后未处理
  setError 拒绝，复跑 3/3 通过。

## 宿主与 profile（执行记录）

- 宿主升级：npm install -g @deepseek-ai/dsh@0.1.0-rc.8；回滚
  npm install -g @deepseek-ai/dsh@0.1.0-rc.7。
- profile web：3 个 SDK 依赖 rc.7 -> rc.8（dsh plugin add 流程）+
  minimumReleaseAgeExclude 同步。
- GUI 验收在 rc.8 宿主上完成（模块表 56 条目基线 rev eddbeb4fdff9）。

## 回滚

仓库：git revert 合并提交；宿主：npm -g 回 rc.7 并恢复 profile 依赖。
