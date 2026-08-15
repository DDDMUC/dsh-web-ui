# dsh-liangshen — LiangShen Mode (two-phase anchored-standard agent preset)

English | [中文](README.zh.md)

Ships the "Anchored Standard" preset family as a one-command plugin of the dsh-web-ui family: on host startup it syncs the bundled presets into `~/.dsh/.agent-presets`, so new sessions can pick "梁神模式" or the experimental "梁神模式-精确实验" from the preset picker. The first model request sees only a two-tool surface, only the one-line persona prompt section, no runtime contexts, and no injected instructions; the full catalog, all prompt sections, and the ordinary injections open after the anchor is established. Built entirely on the official NPM SDK — no dsh source changes.

## Why

DeepSeek V4 Pro conditions strongly on the API tool catalog visible in the FIRST request when choosing its execution trajectory. In the community eval ([xiaobright/modeltest](https://github.com/xiaobright/modeltest)), Standard / PTC scored 91/92 while Minimal reached 99/96 — but Minimal keeps only two tools. This two-phase approach separates the first-trajectory choice from full later capability:

1. The first model request exposes only the platform shell plus `read`, keeps only the `persona` prompt section, empties runtime contexts, and passes only the user's own messages;
2. After the session's first durable `tool/call`, promotion waits until the first reasoning block is minimal-like (contains `we` and no `let me`), with a four-step fallback; the wire then switches to Code Mode (PTC) — a single `run_code` tool backed by the full tool registry SDK — and every assembled prompt section plus the ordinary workspace-instruction, skill-catalog, and runtime-context injections return;
3. The phase derives from persisted session events, so resume / reload never lose state.

Measured on native Windows (DeepSeek V4 Pro, max, V4.1b task): 98 / 99, mean 98.5, zero `let me` traces in the second run — reproducible, not a lucky draw, and no tool capability sacrificed. Original experiment: [xiaobright/dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard).

## Stabilization controls

The preset ships with extra safeguards on top of the reference mechanism, all configured in `agent.cordis.yml` under `tool-bootstrap`:

- `anchorGate` — after the first `tool/call`, the catalog stays two-tool until the first reasoning block classifies minimal-like, so a `Let me` first block does not immediately earn the full catalog;
- `maxBootstrapSteps` — fallback promotion after N steps when no anchored block appeared;
- `promoteAfterFirstResponse` — a tool-less first response promotes once it has responded; an anchor-gated session also releases when its first turn ends (`turn/end`), so the next user turn already sees the promoted catalog;
- `promotedPresentation: code` — after promotion the wire is Code Mode (PTC): one `run_code` tool with the full registry available through the generated SDK, switched at the step boundary so the current step's native calls are never interrupted;
- `deferredSources` + `deferredGraceSteps` — workspace instructions and the skill catalog wait one extra step after promotion, so the tool-catalog switch and the injection shock do not land in the same step.

Plan mode is supported: phase 1 filters the assembled prompt sections down to the one-line `persona`, and promotion restores all sections, so the plan-mode `plan:policy` section takes effect for every step after promotion.

## Install

```sh
# Option 1: family bundle (recommended)
dsh plugin --profile web add @linxin666/dsh-web-ui-all@0.1.12

# Option 2: standalone
dsh plugin --profile web add @linxin666/dsh-liangshen@0.1.12

# Pick ONE of the two: the bundle and the standalone @linxin666/dsh-liangshen
# both mount this preset. If you switch between them, remove the other first:
dsh plugin --profile web remove @linxin666/dsh-liangshen
```

Fully restart `dsh web`, open a NEW empty session, and pick "梁神模式" as the preset. The plugin syncs the presets into `~/.dsh/.agent-presets` at startup (upgrades refresh them automatically on next restart).

## Experimental exact preset

"梁神模式-精确实验" (`liangshen-exact`) keeps the same stabilization controls and shares the main preset's `tool-bootstrap.mjs` implementation (only the `tool-bootstrap` config differs), but matches the builtin Minimal preset's exact phase-1 surface: persistent `bash` plus `str_replace_editor`, byte-identical tool description and one-line persona. After promotion it opens the full Standard catalog and all prompt sections.

Sandboxing: unlike the builtin Minimal preset, `liangshen-exact` does not mount a bare `dsh-fs-local` filesystem — its phase-1 file tools inherit the host file sandbox (the editor reuses the host sandboxed `ctx.fs`), exactly like every Standard file tool.

Tradeoff: the persistent shell replaces the Standard ephemeral `bash` for the whole session (both tools register the name `bash`), so it is the A/B variant for comparing anchor hit rate, not a drop-in replacement for the main preset.

## Verify

Export the session JSONL and inspect `request/header`:

- The first header should carry only `bash/read` (macOS/Linux) or `pwsh/read` (Windows); `liangshen-exact` should carry `bash/str_replace_editor`;
- The first turn should contain only the user's own messages — no workspace-instruction baseline, no runtime snapshot, no skill-catalog message — and only the `persona` prompt section;
- After the first tool call, the next changed header should carry exactly `run_code` (PTC); the runtime snapshot and all prompt sections (including plan mode's `plan:policy`) arrive with that step and the workspace instructions and skill catalog arrive one step later;
- In `liangshen-exact`, phase-1 editor writes still obey the host file sandbox policy — there is no bare local-filesystem bypass;
- Later requests keep `run_code`.

Trajectory drift can be measured without reading raw reasoning:

```sh
node tools/analyze-session.mjs ~/.dsh/sessions/<workspace>/<session>/session.jsonl
```

## Behavior and limits

- A first model response that calls no tool promotes once it has responded; an anchor-gated session also releases when its first turn ends (`turn/end`). The release is decided during prompt assembly, so the new user turn already gets the promoted PTC catalog and its messages are not stripped;
- After the first tool call, promotion waits for the first minimal-like reasoning block or the `maxBootstrapSteps` fallback, whichever comes first;
- A tool call that fails still counts toward promotion as long as `tool/call` was persisted;
- Phase 1 keeps only the `persona` prompt section; promotion restores every assembled section, so plan mode's `plan:policy` is enforced after phase 1;
- Workspace instructions, the skill catalog, and the runtime snapshot stay out of phase 1; the snapshot returns with the catalog and the other two arrive one step later;
- `liangshen-exact` file tools inherit the host file sandbox (no bare `dsh-fs-local` filesystem);
- The catalog changes exactly once, so a prefix-cache change happens between the first and second request;
- The preset carries the same trust level as shell access — review `presets/liangshen/` before installing;
- The plugin makes no network requests and adds no telemetry;
- Do not switch presets mid-conversation;
- Requires DSH 0.1.0-rc.5+ (preset mechanism and the `system-prompt/assemble` hook).

## License

Plugin body Apache-2.0 (zhu1090093659). `presets/liangshen/agent.cordis.yml` derives from the DeepSeek Harness Standard preset, `presets/liangshen-exact/agent.cordis.yml` derives from the builtin Minimal and Standard presets, and `tool-bootstrap.mjs` comes from xiaobright/dsh-anchored-standard — all MIT, with copyright and license notices kept in each preset's `NOTICE`. `presets/liangshen-exact/tool-bootstrap.mjs` is a thin re-export of `presets/liangshen/tool-bootstrap.mjs`, so the two presets share one implementation.
