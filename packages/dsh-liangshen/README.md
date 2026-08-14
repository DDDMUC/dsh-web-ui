# dsh-liangshen — LiangShen Mode (two-phase anchored-standard agent preset)

English | [中文](README.zh.md)

Ships the "Anchored Standard" preset family as a one-command plugin of the dsh-web-ui family: on host startup it syncs the bundled presets into `~/.dsh/.agent-presets`, so new sessions can pick "梁神模式" or the experimental "梁神模式-精确实验" from the preset picker. The first model request sees only a two-tool surface with no runtime contexts or injected instructions; the full catalog and the ordinary injections open after the anchor is established. Built entirely on the official NPM SDK — no dsh source changes.

## Why

DeepSeek V4 Pro conditions strongly on the API tool catalog visible in the FIRST request when choosing its execution trajectory. In the community eval ([xiaobright/modeltest](https://github.com/xiaobright/modeltest)), Standard / PTC scored 91/92 while Minimal reached 99/96 — but Minimal keeps only two tools. This two-phase approach separates the first-trajectory choice from full later capability:

1. The first model request exposes only the platform shell plus `read`, empties runtime contexts, and passes only the user's own messages (keeping the Minimal full system-prompt condition);
2. After the session's first durable `tool/call`, promotion waits until the first reasoning block is minimal-like (`We need` / no `Let me`), with a four-step fallback; every Standard tool then opens and the ordinary workspace-instruction, skill-catalog, and runtime-context injections return;
3. The phase derives from persisted session events, so resume / reload never lose state.

Measured on native Windows (DeepSeek V4 Pro, max, V4.1b task): 98 / 99, mean 98.5, zero `let me` traces in the second run — reproducible, not a lucky draw, and no tool capability sacrificed. Original experiment: [xiaobright/dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard).

## Stabilization controls

The preset ships with extra safeguards on top of the reference mechanism, all configured in `agent.cordis.yml` under `tool-bootstrap`:

- `anchorGate` — after the first `tool/call`, the catalog stays two-tool until the first reasoning block classifies minimal-like, so a `Let me` first block does not immediately earn the full catalog;
- `maxBootstrapSteps` — fallback promotion after N steps when no anchored block appeared;
- `promoteAfterFirstResponse` — a tool-less first response promotes on its next turn, and an anchor-gated session also releases once a new user turn starts, so short tasks never stay two-tool forever;
- `deferredSources` + `deferredGraceSteps` — workspace instructions and the skill catalog wait one extra step after promotion, so the tool-catalog switch and the injection shock do not land in the same step.

## Install

```sh
# Option 1: family bundle (recommended)
dsh plugin --profile web add @linxin666/dsh-web-ui-all

# Option 2: standalone
dsh plugin --profile web add @linxin666/dsh-liangshen
```

Fully restart `dsh web`, open a NEW empty session, and pick "梁神模式" as the preset. The plugin syncs the presets into `~/.dsh/.agent-presets` at startup (upgrades refresh them automatically on next restart).

## Experimental exact preset

"梁神模式-精确实验" (`liangshen-exact`) keeps the same stabilization controls but matches the builtin Minimal preset's exact phase-1 surface: persistent `bash` plus `str_replace_editor`, byte-identical tool description and one-line persona. After promotion it opens the full Standard catalog.

Tradeoff: the persistent shell replaces the Standard ephemeral `bash` for the whole session (both tools register the name `bash`), so it is the A/B variant for comparing anchor hit rate, not a drop-in replacement for the main preset.

## Verify

Export the session JSONL and inspect `request/header`:

- The first header should carry only `bash/read` (macOS/Linux) or `pwsh/read` (Windows); `liangshen-exact` should carry `bash/str_replace_editor`;
- The first turn should contain only the user's own messages — no workspace-instruction baseline, no runtime snapshot, no skill-catalog message;
- After the first tool call, the next changed header should carry the full Standard catalog; the runtime snapshot arrives with that step and the workspace instructions and skill catalog arrive one step later;
- Later requests keep the full catalog.

Trajectory drift can be measured without reading raw reasoning:

```sh
node tools/analyze-session.mjs ~/.dsh/sessions/<workspace>/<session>/session.jsonl
```

## Behavior and limits

- A first model response that calls no tool promotes on its next turn; an anchor-gated session also releases at the next user turn, so it never stays two-tool forever;
- After the first tool call, promotion waits for the first minimal-like reasoning block or the `maxBootstrapSteps` fallback, whichever comes first;
- A tool call that fails still counts toward promotion as long as `tool/call` was persisted;
- Workspace instructions, the skill catalog, and the runtime snapshot stay out of phase 1; the snapshot returns with the catalog and the other two arrive one step later;
- The catalog changes exactly once, so a prefix-cache change happens between the first and second request;
- The preset carries the same trust level as shell access — review `presets/liangshen/` before installing;
- The plugin makes no network requests and adds no telemetry;
- Do not switch presets mid-conversation;
- Requires DSH 0.1.0-rc.5+ (preset mechanism and the `system-prompt/assemble` hook).

## License

Plugin body Apache-2.0 (zhu1090093659). `presets/liangshen/agent.cordis.yml` derives from the DeepSeek Harness Standard preset, `presets/liangshen-exact/agent.cordis.yml` derives from the builtin Minimal and Standard presets, and `tool-bootstrap.mjs` comes from xiaobright/dsh-anchored-standard — all MIT, with copyright and license notices kept in each preset's `NOTICE`.
