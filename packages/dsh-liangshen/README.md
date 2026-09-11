# dsh-liangshen — LiangShen Mode (minimal persona + standard tool catalog)

English | [中文](README.zh.md)

Ships the LiangShen preset as a one-command plugin of the dsh-web family: on host startup it syncs the bundled preset into `~/.dsh/.agent-presets`, so new sessions can pick "梁神模式" from the preset picker, and its browser half adds a slot-machine lever beside the model selector on the new-session screen for switching that mode on and off. The preset keeps the builtin Minimal preset's exact one-line persona as the whole system prompt while the builtin Standard preset's complete tool catalog sits on the wire from the first request — no phase transition, no PTC switch — and injects the tool list as a durable user message after the user's own message, the way the harness injects the skill catalog. Built entirely on the official NPM SDK — no dsh source changes.

## Why

DeepSeek V4 Pro conditions strongly on the model-visible surface of the FIRST request — the system prompt and the API tool catalog alike — when choosing its execution trajectory. In the community eval ([xiaobright/modeltest](https://github.com/xiaobright/modeltest)), Minimal reached 99/96 while Standard / PTC scored 91/92; Minimal's advantage is its one-line persona, and its price is that it keeps only two tools.

LiangShen merges the two instead of switching between them: the anchoring part (the system prompt) stays Minimal for the whole session, and the capable part (the tool catalog) is Standard from the first request. The capability facts the Standard prompt would carry as tool-guidance prose arrive as a message at the prompt tail, so the stable prefix stays the one-line anchor.

## How it works

1. `minimal-prompt` narrows every assembled prompt to the persona section — `You are a helpful software engineer assistant.` — so the harness identity, web-surface, tool-guidance, file-reference, and structured-output sections never reach the model; plan mode's `plan:policy` is kept, because that section is the only thing that enforces plan mode (its exit tool stays registered in every mode);
2. the wire carries the preset's complete tool roster from the first request: the Standard set with the persistent shell in place of the ephemeral one, plus `str_replace_editor`;
3. `tool-catalog` appends the tool list — name plus a one-line summary read from that step's assembled wire schemas — as a durable user message after the user's own message, and republishes it only when the catalog changed or the published copy left the visible surface (a compaction, a resume);
4. runtime contexts (the sandbox and approval snapshots) and the skill catalog flow as in Standard mode, and the first AGENTS.md injection becomes a one-time non-imperative pointer to the reference files.

Windows note: DSH's PTY backend is linux/darwin-only, so on win32 the persistent-shell group is disabled and `bash` comes from `custom-bash` — the same tool name, spawning Git Bash through the ordinary cross-platform subprocess seam (see `presets/liangshen/custom-bash.mjs`).

## The lever

The browser half adds a slot-machine lever to the composer tool row, immediately left of the model selector, on the new-session screen:

- pull the lever down — drag it, click it, or press it with the keyboard — and the session about to start composes LiangShen mode; a landed pull plays the jackpot burst (flash, shockwave, sparks, and a banner reading 梁神模式 over classical Chinese, binary, and Morse lines);
- push it up and the preset you were on before comes back — with nothing remembered yet, that is the deployment default;
- the arm always reports the session's real preset, so a reload shows the true state, and it is only operable while the session is still blank, because the host refuses to recompose a session that has already started;
- a refused switch prints the host's reason under the lever and never plays the burst, and `prefers-reduced-motion` keeps the state change while dropping the animation.

The lever drives the session's preset through the agent-preset Remote namespace the browser session is already authenticated for, so it needs no additional permissions. It acts on the preset only while the session is blank, which is exactly the new-session screen it renders on.

## Preset configuration

Both preset-local plugins are configured in `agent.cordis.yml`:

| Key | Default | Behavior |
| --- | --- | --- |
| `keepPlanPolicy` | `true` | Keep plan mode's `plan:policy` section in the otherwise one-line system prompt. Set `false` for the strict one-line surface, which leaves plan mode with no policy text behind it. |
| `instructionHint` | `true` | Replace the first full-text AGENTS.md injection with a one-time pointer naming the reference files, and drop later injections. Set `false` to restore the plain full-text injection. |
| `descriptionMaxLength` | `200` | Cap for one tool's one-line summary in the injected catalog. The full description stays in the tool schema. |

## Install

```sh
# Option 1: family bundle (recommended)
dsh plugin --profile web add @linxin666/dsh-web-all@latest

# Option 2: standalone
dsh plugin --profile web add @linxin666/dsh-liangshen@latest

# Pick ONE of the two: the bundle and the standalone @linxin666/dsh-liangshen
# both mount this preset. If you switch between them, remove the other first:
dsh plugin --profile web remove @linxin666/dsh-liangshen
```

Fully restart `dsh web`, open a NEW empty session, and pick "梁神模式" as the preset. The plugin syncs the presets into `~/.dsh/.agent-presets` at startup (upgrades refresh them automatically on next restart).

## Verify

Export the session JSONL and inspect `request/header`:

- the first header's `system` should be exactly the one-line persona, plus plan mode's policy while plan mode is on;
- the first header's tools should be the preset's full roster — never two tools, and never `run_code`;
- the step's admitted messages should hold one `plugin`-sourced message from `liangshen-tool-catalog` after the user message, listing the tools by name;
- later headers keep the same tool list, and no further catalog message is appended per step;
- after a compaction the catalog is republished once as a replacement list;
- file writes obey the host file sandbox policy — there is no bare local-filesystem bypass.

Trajectory drift can be measured without reading raw reasoning:

```sh
node tools/analyze-session.mjs ~/.dsh/sessions/<workspace>/<session>/session.jsonl
```

## Configuration

| Key | Default | Behavior |
| --- | --- | --- |
| `enabled` | `true` | Master switch: when false, neither preset sync nor announcement runs. |
| `announceToAgent` | `false` | Opt-in: when true, a system-prompt section announces the plugin. Off by default so agent system prompts stay clean. |

Both fields are editable in the web settings surface (plugin config, live) or through the profile patch (`dsh plugin` / `cordis.patch.yml`).

## Behavior and limits

- The system prompt is stable for the whole session: the persona line, plus plan mode's policy while plan mode is on. Nothing is appended after a tool call, and no output-token cap is applied;
- The tool catalog never changes, so no catalog-driven prefix-cache break happens after the first request;
- The injected catalog is durable: it is written once per session, plus one replacement when the tool set changes or a compaction shadows the published copy, and it stays in the history for later requests;
- A step whose prompt assembly was not observed injects nothing — the catalog is never guessed from a stale view;
- A composition exposing none of the accepted persona section names (`deployment:persona-prefix`, `deployment:persona`, `persona`) keeps the assembled prompt and warns once instead of sending an empty system prompt;
- Plan mode is supported through its `plan:policy` section; with `keepPlanPolicy: false` the mode keeps its tool but loses the policy text that enforces it;
- The persistent `bash` replaces the Standard ephemeral shell for the whole session (both tools register the name `bash`), so shell state survives across calls; on win32 `custom-bash` provides the same-named tool through Git Bash, with no OS sandbox confinement;
- The file tools inherit the host file sandbox (no bare `dsh-fs-local` filesystem);
- The preset carries the same trust level as shell access — review `presets/liangshen/` before installing;
- The plugin makes no network requests and adds no telemetry;
- Do not switch presets mid-conversation;
- Requires DSH 0.1.5-rc.1+ (preset mechanism, the `system-prompt/assemble` waterfall, and the persona `prefix` schema).

## License

Plugin body Apache-2.0 (zhu1090093659). `presets/liangshen/agent.cordis.yml` derives from the DeepSeek Harness builtin Minimal and Standard presets (MIT), and `custom-bash.mjs` comes from xiaobright/dsh-anchored-standard (MIT) — copyright and license notices are kept in the preset's `NOTICE`.
