# Agent Note: 清理梁神模式动态推理努力度

Status: implemented

部分取代[梁神模式面向 DeepSeek V4.1 Flash 的原生重构](../feature/2026-09-16-liangshen-v41-flash-native-rebuild.zh.md)：移除 preset 内部的 `reasoning-effort` 插件、相关配置键（`autoEffortByPhase`、`planningEffort`、`executionEffort`、`reviewEffort`）及其设置卡控件。预设的极简 persona、工具呈现模式与温和工具分页机制继续有效。

## Problem

`dsh-liangshen` 中的分阶段动态推理努力度机制（`reasoning-effort.mjs`）试图在规划（`high`）、执行（`low`）和复核（`high`）阶段之间动态切换 LLM 请求的 `reasoningEffort`。

在实际使用中，该机制几乎没有实际价值，并带来了若干问题：
1. **缺乏实效且出厂停用**：`autoEffortByPhase` 出厂默认关闭（`false`），因为静默覆盖用户在模型选择器中显式指定的推理档位违反了直觉，实际工程与日常会话中极少被启用。
2. **破坏前缀缓存**：开启时在阶段边界调整 `reasoningEffort` 会改变请求头快照，破坏服务端前缀 KV 缓存的复用，增加首字延迟与 Prefill 开销。
3. **与 Persona 熔断纪律重叠**：在单步执行阶段，提示词内的行动熔断规则（反思熔断：无事实依据的假设推演不超过两轮并立即闭合思考调用工具）已足以压制发散思维，无需在请求参数层面强行降档。
4. **维护成本高**：维护阶段跟踪、状态回退、设置表单字段、多语言字典和预设同步重写，在 host、client 与 preset 各层增加了冗余复杂度。

## Decision

彻底清理 `dsh-liangshen` 中的动态推理努力度功能：
- 删除 `presets/liangshen/reasoning-effort.mjs`，并从 `presets/liangshen/agent.cordis.yml` 中移除该插件行。
- 从 `src/index.ts` 的 `Config` 接口、Schemastery schema、默认常量及 guidance 描述中移除 `autoEffortByPhase`、`planningEffort`、`executionEffort` 和 `reviewEffort`。
- 从 `src/sync.ts` 中移除 `PresetOverrides` 的推理努力度字段及相关覆写逻辑。
- 清理 `LiangShenSettingsCard.tsx` 与 `src/client/locales.ts`，设置卡仅保留 `enabled`、`announceToAgent` 与 `presentation`。
- 同步清理 `packages/dsh-i18n/src/client/ru/liangshen.ts` 中的对应键。
- 删除 `tests/reasoning-effort.test.ts`，并更新 `preset-composition.test.ts`、`settings-card.spec.tsx` 与 `sync.test.ts`。

## Alternatives considered

- **保留默认关闭的休眠代码**：否决。在代码库中保留休眠特性和无用设置项会误导用户，并增加持续维护、测试和同步的负担。
- **将推理努力度调节转为提示词指导**：否决。Persona 中内置的工作纪律已明确约束了思考边界（两轮假设上限、行动导向执行），无需额外冗余规则。

## Consequences

- `dsh-liangshen` 预设和设置界面更加聚焦于工具呈现模式（`ptc`、`native`、`both`）、极简 persona 纪律与温和工具分页。
- 模型选择器中由用户显式指定的推理档位在整个会话中全局生效，不再受隐式干预，前缀缓存更加稳定。
- 预设同步逻辑在宿主下次启动时会自动清理已退役的 `reasoning-effort.mjs` 文件。

## Testing

- `packages/dsh-liangshen` 单元测试：全部 18 个测试文件（296 个测试）通过 `vitest run` 全绿。
- 类型检查：`packages/dsh-liangshen` 与 `packages/dsh-i18n` 经 `tsc --noEmit` 均 0 错误通过。
- 语言包校验：`pnpm i18n:check` 验证 zh/en/ru 键集 100% 对齐。
- 文档校验：`pnpm docs:check` 验证全仓文档双语配对全部通过。
- 产物指纹：重构客户端产物并更新 `lib/` 指纹后 `pnpm libs:check` 校验通过。
