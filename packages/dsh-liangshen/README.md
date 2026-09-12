# dsh-liangshen — LiangShen Mode (minimal persona + PTC tool surface)

English | [中文](README.zh.md)

Ships the LiangShen preset as a one-command plugin of the dsh-web family: on host startup it syncs the bundled preset into `~/.dsh/.agent-presets`, so new sessions can pick "梁神模式" from the preset picker, and its browser half adds a slot-machine lever beside the model selector on the new-session screen for switching that mode on and off. The preset keeps the builtin Minimal preset's one-line persona — extended with the mode's standing working discipline, the session's workspace directory, and the AGENTS.md-style workspace instructions — as the whole system prompt, and delivers its tool surface as a durable user message after the user's own message from the first turn on — the way the harness injects the skill catalog — while the wire is staged: the first (anchor) turn carries the builtin Minimal surface exactly (`bash` alone, natively presented), and from the second turn the session presents its tools in PTC mode, where the wire carries the single `run_code` transport and every other tool is reached from inside the program through the generated SDK. The one wire transition is the deterministic turn boundary, with no reasoning gating and no output-token cap. Built entirely on the official NPM SDK — no dsh source changes.

## Why

DeepSeek V4 Pro conditions strongly on the model-visible surface of the FIRST request — the system prompt and the API tool catalog alike — when choosing its execution trajectory. In the community eval ([xiaobright/modeltest](https://github.com/xiaobright/modeltest)), Minimal reached 99/96 while Standard / PTC scored 91/92; Minimal's advantage is its one-line persona, and its price is that it keeps only two tools.

LiangShen merges the two instead of switching between them: the anchoring part (the system prompt) stays Minimal for the whole session, and the capable part (the tool surface) is announced from the first user message through a skill-catalog-style injection, while its schemas engage at the deterministic turn boundary. Under PTC presentation that injection is the model's only source for the generated SDK's bindings, for the program contract that lets one program carry a whole multi-step plan, and for the rule that only `run_code` may be called directly, because the one-line system prompt filters the harness's own `tools:sdk` and `tools:ptc-only` sections away. The capability facts the Standard prompt would carry as tool-guidance prose arrive as a message at the prompt tail, so the stable prefix stays the one-line anchor.

## How it works

1. `minimal-prompt` narrows every assembled prompt to the persona section — the one-line persona, the mode's standing working discipline (exit thinking loops immediately, design-first reasoning over pre-rehearsed code, YAGNI and PDCA, no code comments), and one appended orientation line, `Your working directory is <cwd>.` read from the session header — so the harness identity, web-surface, tool-guidance, file-reference, and structured-output sections never reach the model; plan mode's `plan:policy` is kept, because that section is the only thing that enforces plan mode (its exit tool stays registered in every mode);
2. the AGENTS.md-style workspace instructions join the system prompt itself: at assembly time `minimal-prompt` reads the harness's baseline chain (`$DSH_HOME/AGENTS.md`, then `AGENTS.md` / `CLAUDE.md` and their `.local` overlays from the project root down to the session cwd) and appends the content as one `workspace-instructions` section after the stable prefix, under a byte budget that omits broadest files first and truncates the most specific last; the read happens on every assembly, so file edits propagate without durable messages, and the harness's own agent-instructions injections are dropped instead of duplicating the prompt;
3. the anchor turn — the session's first — keeps the wire on the builtin Minimal surface: `bash` alone, presented natively (`anchorTools`); from the second turn `tool-catalog` declares PTC presentation for that session (`agent.ctx.tools.presentAs('ptc')`, declared on the anchor turn's end so the promoted turn's first request already carries the collapsed surface), so the wire collapses to the single `run_code` transport and every other tool in the preset's roster — the Standard-like set with the persistent shell in place of the ephemeral one, plus `str_replace_editor` — is reached from inside the program through the generated SDK;
4. `tool-catalog` appends the tool list — each tool's argument signature plus a one-line summary — as a durable user message after the user's own message from the first turn on. Its entries are the PTC surface read from the registry (`ctx.tools.sdkSchemas`), not the narrowed anchor wire, so the first turn already names what the promoted turn reaches and the rendered text does not change at the boundary. Under PTC the message also carries the program contract the harness states in those same filtered sections: one program per intent instead of one call per step, `run_code`'s `code`/`description` shape, independent read-only calls overlapping under `Promise.all`, `ToolCallError` handling, curated program output, and the rule that only `run_code` may be called directly once it is on the wire. It republishes only when the surface changed or the published copy left the visible surface (a compaction, a resume);
5. runtime contexts (the sandbox and approval snapshots) and the skill catalog flow as in Standard mode.

Windows note: DSH's PTY backend is linux/darwin-only, so on win32 the persistent-shell group is disabled and `bash` comes from `custom-bash` — the same tool name, spawning Git Bash through the ordinary cross-platform subprocess seam (see `presets/liangshen/custom-bash.mjs`).

## The lever

The browser half adds a slot-machine lever to the composer tool row, immediately left of the model selector, on the new-session screen:

- pull the lever down — drag it, click it, or press it with the keyboard — and the session about to start composes LiangShen mode; a landed pull plays the jackpot burst (flash, shockwave, sparks, and a banner reading 梁神模式 over classical Chinese, binary, and Morse lines);
- push it up and the preset you were on before comes back — with nothing remembered yet, that is the deployment default;
- the arm always reports the session's real preset, so a reload shows the true state, and the lever renders only while the session is still blank — in a session that has started, the host refuses to recompose, and the row disappears from the composer entirely;
- a refused switch prints the host's reason under the lever and never plays the burst, and `prefers-reduced-motion` keeps the state change while dropping the animation.

The lever drives the session's preset through the agent-preset Remote namespace the browser session is already authenticated for, so it needs no additional permissions. It acts on the preset only while the session is blank, which is exactly the new-session screen it renders on.

## Preset configuration

Both preset-local plugins are configured in `agent.cordis.yml`:

| Key | Default | Behavior |
| --- | --- | --- |
| `keepPlanPolicy` | `true` | Keep plan mode's `plan:policy` section in the otherwise one-line system prompt. Set `false` for the strict one-line surface, which leaves plan mode with no policy text behind it. |
| `instructionSource` | `system-prompt` | Where workspace instructions reach the model. `system-prompt` reads the AGENTS.md-style chain at assembly time and appends it to the system prompt (the harness's own injections are dropped); `hint` restores the pointer behavior: the first injection becomes a one-time non-imperative reference-file hint and later injections are dropped. |
| `instructionMaxBytes` | `65536` | Byte budget for the rendered workspace-instructions section (system-prompt mode): broadest files are omitted first, the most specific file is truncated last. |
| `descriptionMaxLength` | `200` | Cap for one tool's one-line summary in the injected catalog. The full description stays in the tool schema. |
| `anchorTools` | `[]` | Tool names that alone form the anchor turn's wire, presented natively; the promoted surface engages from the second turn. Empty disables staging (the assembled wire from the first request). The shipped preset sets `bash`. |
| `ptcPresentation` | `true` | Declare this session's tools in PTC mode from the second turn on, so the wire collapses to `run_code` and the injected catalog names the SDK bindings. Needs a mounted code runtime; a deployment without one stays native with a one-time warning. Set `false` to keep the assembled roster on the wire from the second turn. |

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

- the first header's `system` should be exactly the persona block (the one-line persona, the working-discipline list, and the workspace line `Your working directory is <cwd>.`), plus plan mode's policy while plan mode is on, plus the `workspace-instructions` section carrying the AGENTS.md chain;
- the first header's tools should be exactly the anchor surface — `bash` alone, presented natively — never the promoted roster and never `run_code`;
- the first turn's admitted messages should hold one `plugin`-sourced message from `liangshen-tool-catalog` after the user message, naming the promoted surface by argument signature and stating the `run_code` contract;
- from the second turn on, headers carry exactly one tool, `run_code` (PTC presentation); the rendered catalog no longer changes, so no further catalog message is appended per step;
- after a compaction the catalog is republished once as a replacement list and the session stays in PTC mode;
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

- The system prompt is stable for the whole session: the persona block (persona, working discipline, workspace directory), plus plan mode's policy while plan mode is on, plus the workspace-instructions section. Nothing is appended after a tool call, and no output-token cap is applied;
- The workspace-instructions section is re-read at every assembly, so instruction-file edits propagate on the next request without a durable message; the section renders last, after the stable prefix, so the anchor's cache prefix stays intact. The harness's dynamic reconciliation of descendant instruction files (nested `AGENTS.md` surfaced when a `read`/`write`/`edit` tool touches their directory) is not reproduced: those injections are dropped like the baseline ones, and this mode's file tools rarely carry the `read`/`write`/`edit` names that trigger it;
- The wire's schema set changes exactly once, at the anchor-turn boundary — from the Minimal `bash` schema to the single `run_code` transport; the catalog message itself is written once per session (plus one replacement when a compaction shadows it), so no per-step or per-turn cache-prefix churn follows;
- The injected catalog is durable: it is written once per session, plus one replacement when the tool surface changes or a compaction shadows the published copy, and it stays in the history for later requests;
- A step whose prompt assembly was not observed injects nothing — the catalog is never guessed from a stale view;
- A composition exposing none of the accepted persona section names (`deployment:persona-prefix`, `deployment:persona`, `persona`) keeps the assembled prompt and warns once instead of sending an empty system prompt;
- Plan mode is supported through its `plan:policy` section; with `keepPlanPolicy: false` the mode keeps its tool but loses the policy text that enforces it;
- PTC presentation is declared per session and needs a mounted code runtime (the shipped web and headless compositions mount `dsh-code-runtime-worker-thread`); without one the mode stays native — the assembled roster rides the wire from the second turn and the catalog carries no `run_code` contract — with a one-time warning;
- The roster is the builtin PTC preset's model-authored surface: the `workflow` tool is not published beside `run_code`, while the workflow engine stays mounted for `ralph`;
- The persistent `bash` replaces the Standard ephemeral shell for the whole session (both tools register the name `bash`), so shell state survives across calls; on win32 `custom-bash` provides the same-named tool through Git Bash, with no OS sandbox confinement;
- The file tools inherit the host file sandbox (no bare `dsh-fs-local` filesystem);
- The preset carries the same trust level as shell access — review `presets/liangshen/` before installing;
- The plugin makes no network requests and adds no telemetry;
- Do not switch presets mid-conversation;
- Requires DSH 0.1.5-rc.1+ (preset mechanism, the `system-prompt/assemble` waterfall, the persona `prefix` schema, and the PTC presentation API).

## License

Plugin body Apache-2.0 (zhu1090093659). `presets/liangshen/agent.cordis.yml` derives from the DeepSeek Harness builtin Minimal, Standard, and PTC presets (MIT), and `custom-bash.mjs` comes from xiaobright/dsh-anchored-standard (MIT) — copyright and license notices are kept in the preset's `NOTICE`.
