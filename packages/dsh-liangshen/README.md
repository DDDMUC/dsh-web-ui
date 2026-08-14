# dsh-liangshen — LiangShen Mode (two-phase anchored-standard agent preset)

English | [中文](README.zh.md)

Ships the experimental "Anchored Standard" preset as a one-command plugin of the dsh-web-ui family: on host startup it syncs the bundled `presets/liangshen` tree into `~/.dsh/.agent-presets/liangshen`, so new sessions can pick "梁神模式" from the preset picker. The first model request sees only the platform shell plus `read` and no runtime contexts or injected instructions; the full catalog and the ordinary injections return after the first durable tool call. Built entirely on the official NPM SDK — no dsh source changes.

## Why

DeepSeek V4 Pro conditions strongly on the API tool catalog visible in the FIRST request when choosing its execution trajectory. In the community eval ([xiaobright/modeltest](https://github.com/xiaobright/modeltest)), Standard / PTC scored 91/92 while Minimal reached 99/96 — but Minimal keeps only two tools. This two-phase approach separates the first-trajectory choice from full later capability:

1. The first model request exposes only the platform shell plus `read`, empties runtime contexts, and passes only the user's own messages (keeping the Minimal full system-prompt condition);
2. After the session's first durable `tool/call`, every Standard tool opens up and the ordinary workspace-instruction, skill-catalog, and runtime-context injections return;
3. The phase derives from persisted session events, so resume / reload never lose state.

Measured on native Windows (DeepSeek V4 Pro, max, V4.1b task): 98 / 99, mean 98.5, zero `let me` traces in the second run — reproducible, not a lucky draw, and no tool capability sacrificed. Original experiment: [xiaobright/dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard).

## Install

```sh
# Option 1: family bundle (recommended)
dsh plugin --profile web add @linxin666/dsh-web-ui-all

# Option 2: standalone
dsh plugin --profile web add @linxin666/dsh-liangshen
```

Fully restart `dsh web`, open a NEW empty session, and pick "梁神模式" as the preset. The plugin syncs the preset into `~/.dsh/.agent-presets/liangshen` at startup (upgrades refresh it automatically on next restart).

## Verify

Export the session JSONL and inspect `request/header`:

- The first header should carry only `bash/read` (macOS/Linux) or `pwsh/read` (Windows);
- The first turn should contain only the user's own messages — no workspace-instruction baseline, no runtime snapshot, no skill-catalog message;
- After the first tool call, the next changed header should carry the full Standard catalog, and the quarantined injections arrive with that step;
- Later requests keep the full catalog.

## Behavior and limits

- A first model response that calls no tool never promotes — the session keeps the two-tool, no-injection surface;
- A tool call that fails still promotes as long as `tool/call` was persisted;
- Workspace instructions, the skill catalog, and the runtime snapshot stay out of phase 1 and arrive at the promotion step;
- The catalog changes exactly once, so a prefix-cache change happens between the first and second request;
- The preset carries the same trust level as shell access — review `presets/liangshen/` before installing;
- The plugin makes no network requests and adds no telemetry;
- Do not switch presets mid-conversation;
- Requires DSH 0.1.0-rc.5+ (preset mechanism and the `system-prompt/assemble` hook).

## License

Plugin body Apache-2.0 (zhu1090093659). `presets/liangshen/agent.cordis.yml` derives from the DeepSeek Harness Standard preset and `tool-bootstrap.mjs` comes from xiaobright/dsh-anchored-standard — both MIT, with copyright and license notices kept in `presets/liangshen/NOTICE`.
