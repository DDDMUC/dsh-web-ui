# Agent Note: 移除 dsh-perf

Status: implemented

彻底移除内置的性能观测插件，沿用 [dsh-aionui-panel 移除](2026-08-28-remove-dsh-aionui-panel.md) 的模式：聚合行、陈旧的 workspace 依赖和全部引用一并清理，包目录删除。

## Problem

dsh-perf 提供了 host 指标 API（loopback 围栏的 `/api/dsh-perf/stats`）、客户端 HUD、基于 `sessions.list` 的渲染降载管线和设置卡。它的调谐行是唯一被允许修改 `session-persistence-jsonl` harness 条目的行，并且在三个构建脚本里都有特例（`aggregate.mjs` 的补丁顺序注释、`sync-shared.mjs` 的 pre-0.1.2 settings-form 例外、`i18n-audit.mjs` 的包行）。插件退役后，继续保留代码、字典命名空间、CI labeler 规则和 issue 模板选项，意味着在整个家族面上维护死面：聚合包、lockfile、desktop runtime payload、ru 语言包、market 徽章白名单和 README 功能列表。

## Decision

dsh-perf 包被彻底移除：

- 删除 `packages/dsh-perf` 目录（含 `docs/dsh-perf-optimization-report.md`），其行从 dsh-web-all 的 `aggregate.yml` 的 `patchFrom` 与 `deps` 列表移除。`node scripts/aggregate.mjs` 重新生成 patch（`web-ui-dsh-perf` insert 行与 `session-persistence-jsonl` 调谐 patch 消失），并像 aionui 移除时记录的那样，手工覆盖生成器的 keep-unknown-deps 规则，让陈旧的 `@linxin666/dsh-perf` workspace 依赖从 `packages/dsh-web-all/package.json` 删除。
- `scripts/aggregate.mjs` 去掉 dsh-perf/better-session 补丁顺序注释（机制保留，仅移除已不存在的示例），`scripts/aggregate.test.mjs` 翻转断言：聚合 patch 现在必须不包含 `@linxin666/dsh-perf`，替代原先"调谐行是唯一允许修改 `session-persistence-jsonl` 的行"的断言。
- `scripts/sync-shared.mjs` 删除 `SETTINGS_CARD_ONLY_CONSUMERS` 列表和小写 `plugin-settings-card.tsx` 复制目标；settings 三件套的消费者重新合并为单一列表。
- `scripts/i18n-audit.mjs` 删除 dsh-perf 的语言审计行；`packages/dsh-i18n` 删除 `src/client/ru/perf.ts`、注销 `dsh-perf` 命名空间，并更新 README 命名空间表与测试（现为 14 个命名空间）。
- 门禁与元数据：`.github/labeler.yml` 移除 `area/perf`，issue 模板移除 `性能监控 (dsh-perf)` 选项，`.gitignore` 删除 `packages/dsh-perf/lib/`；`market/worker/src/npm-badge.js` 将 `@linxin666/dsh-perf` 保留在 `FAMILY_PACKAGES` 中——徽章聚合的是已发布包名的下载量，npm 包仍留在 registry 上，移除会让报告的总数静默缩水。
- 文档：根 README 对移除性能引擎功能小节与标语项（重录配对哈希），dsh-i18n README 对移除表格行。
- Desktop runtime：`desktop/runtime/profile-web/pnpm-workspace.yaml` 及其 lockfile 移除 `@linxin666/dsh-perf@0.3.14` 的 release-age 排除与 lock 条目；staged 的 `desktop/resources/runtime/` payload 副本同变更刷新（`build-runtime.mjs` 不受影响——它从已发布的 `@linxin666/dsh-web-all` 安装，该包要到下一次发布才不再依赖 dsh-perf）。
- 描述存活行为的注释级引用保留：`packages/dsh-usage/src/host/routes.ts`（loopback 围栏的设计出处）、`packages/dsh-session-archive/src/host/session-files.ts`（被删插件确立的 session-rdb 指纹契约）、`docs/dsh-sleeping-tabs-research.md`（研究文档）、冻结的 release notes 与归档 note。

## Alternatives considered

- 保留包可独立安装但移出聚合包：否决——插件仅有的表面（设置卡与 HUD）都由聚合包的 client child 接线驱动；孤儿包会保留全部维护成本（构建预设、i18n 审计行、ru 字典、发布准备）却没有用户能从默认安装触达。
- 保留 `session-persistence-jsonl` 调谐行（迁到存活的包或聚合包自身）：否决——调谐值（写批延迟、prepared cache 大小）是 dsh-perf 的治理旋钮而非中性默认值；回到 stock harness 行才是诚实的移除，且 aggregate 测试现在断言 dsh-perf 不得再现。

## Consequences

所有安装失去性能 HUD、归因记分板、渲染降载与写批调谐——stock 的 `session-persistence-jsonl` harness 行以自身默认值服务会话。ru 语言包覆盖 14 个命名空间（原 15 个）。npm 徽章总数不变。已发布的 dsh-web-all 版本仍然依赖 registry 上的 `@linxin666/dsh-perf`；钉在这些版本的 desktop payload 在重新 staging 前继续工作。独立挂载过 dsh-perf 的用户保留已装内容，但该包不再发布新版本。

## Testing

`node scripts/aggregate.mjs --check` 通过（18 行，17 依赖，14 client child）；`pnpm install` 从 `pnpm-lock.yaml` 修剪了 workspace importer（86 行），desktop runtime lockfile 通过 `pnpm install --lockfile-only` 策略校验；`pnpm build` 重新生成 `packages/dsh-web-all/lib/client.js`，其中 dsh-perf region 为零；`pnpm typecheck`、`pnpm test`、`pnpm test:scripts`、`pnpm docs:check`、`pnpm i18n:check`、`pnpm aggregate:check`、`pnpm market:check` 全部通过。残留提及均为有意保留：本 note 的交叉链接与上文列出的注释级引用、冻结的 release notes 与归档、market 徽章白名单，以及 `aggregate.test.mjs` 里的防再现守卫。