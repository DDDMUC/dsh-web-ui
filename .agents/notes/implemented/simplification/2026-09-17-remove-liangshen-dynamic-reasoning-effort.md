# Agent Note: remove liangshen dynamic reasoning effort

Status: implemented

Partially supersedes [LiangShen preset V4.1 Flash native rebuild](../feature/2026-09-16-liangshen-v41-flash-native-rebuild.md): removes the preset-local `reasoning-effort` plugin, its configuration keys (`autoEffortByPhase`, `planningEffort`, `executionEffort`, `reviewEffort`), and its settings card controls. The preset's minimal persona, tool presentation modes, and gentle tool paging remain fully in effect.

## Problem

The phase-aware reasoning effort mechanism in `dsh-liangshen` (`reasoning-effort.mjs`) attempted to switch the LLM call's `reasoningEffort` dynamically between planning (`high`), execution (`low`), and review (`high`) stages.

In real-world usage, this mechanism provided negligible practical value and introduced several liabilities:
1. **Ineffectiveness and defaults**: `autoEffortByPhase` shipped disabled by default (`autoEffortByPhase: false`) because overriding the user's explicit model picker choice violated user expectations; in practice, users rarely enabled it.
2. **Cache invalidation and friction**: When enabled, altering `reasoningEffort` across phase boundaries modifies the request header snapshot and invalidates server-side prefix KV cache reuse, increasing latency and prompt prefill cost.
3. **Redundancy with persona fuses**: In single-step execution turns, prompt-level working discipline (Thinking Disruption fuses: immediate termination of reasoning after two passes without new facts) already prevents runaway thinking loops without manipulating request-level effort parameters.
4. **Maintenance overhead**: Maintaining phase tracking, fallback logic, settings card form fields, bilingual dictionaries, and preset sync rewrites added significant complexity across the host, client, and preset layers.

## Decision

The dynamic reasoning effort feature is removed completely from `dsh-liangshen`:
- Deleted `presets/liangshen/reasoning-effort.mjs` and its row under `presets/liangshen/agent.cordis.yml`.
- Removed `autoEffortByPhase`, `planningEffort`, `executionEffort`, and `reviewEffort` from the plugin's `Config` interface, Schemastery schema, default constants, and guidance text in `src/index.ts`.
- Removed `PresetOverrides` effort fields and row rewriting in `src/sync.ts`.
- Cleaned up `LiangShenSettingsCard.tsx` and `src/client/locales.ts` to expose only `enabled`, `announceToAgent`, and `presentation`.
- Cleaned up corresponding keys in `packages/dsh-i18n/src/client/ru/liangshen.ts`.
- Deleted `tests/reasoning-effort.test.ts` and updated `preset-composition.test.ts`, `settings-card.spec.tsx`, and `sync.test.ts`.

## Alternatives considered

- **Keep the plugin dormant with default off**: Rejected. Retaining dormant code and dead settings options misleads users and burdens ongoing maintenance, testing, and synchronization.
- **Convert effort adjustment into prompt guidance**: Rejected. The persona working discipline already establishes the necessary cognitive boundaries (two-pass hypothesis cap, action-oriented execution).

## Consequences

- The `dsh-liangshen` preset and settings UI now focus solely on tool presentation modes (`ptc`, `native`, `both`), minimal persona discipline, and gentle tool paging.
- The model picker's explicit reasoning level choice governs all turns consistently throughout the session without unexpected interference or phase-boundary cache invalidation.
- Preset sync automatically retires stale `reasoning-effort.mjs` files on next startup.

## Testing

- Unit tests in `packages/dsh-liangshen`: all 18 test files (296 tests) pass cleanly via `vitest run`.
- Type checking passes with zero diagnostics across `packages/dsh-liangshen` and `packages/dsh-i18n`.
- Locale verification: `pnpm i18n:check` confirms complete zh/en/ru key parity with zero errors.
- Documentation verification: `pnpm docs:check` passes across all documentation pairs.
- Artifact verification: `pnpm libs:check` passes after rebuilding and updating fingerprints.
