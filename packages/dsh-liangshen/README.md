# dsh-liangshen — LiangShen Mode (minimal persona + programmatic tool transport)

English | [中文](README.zh.md)

Ships the LiangShen preset as a one-command plugin of the dsh-web family: on host startup it syncs the bundled preset into `~/.dsh/.agent-presets`, so new sessions can pick "梁神模式" from the preset picker, and its browser half adds a slot-machine lever beside the model selector on the new-session screen for switching that mode on and off. The preset keeps a minimal persona with standing working discipline and the session workspace directory in the system prompt, lets the harness deliver AGENTS.md-style workspace instructions as its own user-role messages, and delivers its tool surface as a durable user message after the user's message — the way the harness injects the skill catalog, naming exactly the tools that request opens. The wire keeps one presentation for the whole session (`presentation: 'ptc'` by default): it collapses to the single `run_code` transport and every other tool is reached inside the program through the generated SDK, which leaves the native roster's schema payload out of every request. A deployment without a mounted code runtime degrades to the native surface with a one-time warning instead of presenting a transport the request cannot carry. Tools held back by paging (default pattern `mcp__*`) are unreachable until activated: they appear in the catalog as namespace summaries, and under `ptc` they stay out of the generated SDK as well, because the page is a registry restriction rather than only a wire filter. `tool_activate` loads one namespace back onto the whole surface. Built entirely on the official NPM SDK — no dsh source changes.

## Why

DeepSeek V4.1 Flash is post-trained against its native DSML tool-call surface, and the official scaffold comparison for code-agent benchmarks places a native minimal surface ahead of a programmatic (PTC) one (DeepSWE v1.1: 72.6% native minimal vs 67.6% PTC; Terminal-Bench 2.1: 90.6% vs 85.8%). Real engineering sessions, meanwhile, depend on MCP servers and plugins that a closed four-tool surface cannot reach, while a flat roster carrying every external schema buries the conversation under tool definitions.

LiangShen mode therefore keeps the whole session on one presentation, chosen by the `presentation` key. The shipped default is `ptc`: the wire collapses to the single `run_code` transport and every other tool is reached from inside the program through the generated SDK, which is the cheapest static context of the three modes because the native roster's schema payload leaves every request. That default is a static-context choice, not a measured win — the same official comparison ranks this presentation below the natively presented surface on both code-agent benchmarks (DeepSWE v1.1: 67.6 against 72.6; Terminal-Bench 2.1: 85.8 against 90.6), and this repository has not run the bundled matrix that would settle the trade. Set `presentation: 'native'` (or `'both'`) to opt into the surface the official numbers favour. The anchoring part (the system prompt) stays a compact persona with an action-triggered working discipline; the capability part is announced from the first user message on as a durable skill-catalog-style injection that names exactly the tools the request opens. External tools matched by the paging patterns (default `mcp__*`) are announced as namespace summaries and stay off the wire — and, under `ptc`, out of the generated SDK, because the page is applied to the registry a program dispatches against — until `tool_activate`, so the static schema surface stays small. The mode makes no overcommitment of benchmark superiority; it guarantees that the declared surface and the request's own wire never disagree.

## How it works

1. `minimal-prompt` narrows every assembled prompt to the persona section — the one-line persona, the mode's standing working discipline (close a repeated hypothesis after two reasoning passes and call an inspection tool instead of speculating; think only about the next concrete operation rather than pre-rehearsing code; emit multiple tool calls concurrently in a single turn for independent inspections; treat shell processes as ephemeral with no directory persistence across calls and use compound commands or explicit workdir for subdirectories; verify against actual tool output during execution; YAGNI and PDCA; no redundant comments), and one appended orientation line, `Your working directory is <cwd>.` read from the session header — so the harness identity, web-surface, tool-guidance, file-reference, and structured-output sections do not reach the model by default; plan mode's `plan:policy` is kept, because that section is the only thing that enforces plan mode (its exit tool stays registered in every mode);
2. AGENTS.md-style workspace instructions reach the model through `instructionSource`: by default (`host`) the preset appends no section of its own and leaves the harness's own delivery of those instructions untouched, so they arrive as its user-role messages — one persistent baseline plus incremental additions, replacements, and removals as directories are touched; under `system-prompt` they join the system prompt itself: at assembly time `minimal-prompt` reads the harness's baseline chain (`$DSH_HOME/AGENTS.md`, then `AGENTS.md` / `CLAUDE.md` and their `.local` overlays from the project root down to the session cwd) and appends the content as one `workspace-instructions` section after the stable prefix, under a byte budget that omits broadest files first and truncates the most specific last; the read happens on every assembly, so file edits propagate without durable messages, and the harness's own agent-instructions injections are dropped instead of duplicating the prompt. Subdirectory dynamic rules will subsequently support registered file tools (including `str_replace_editor`) and `run_code` sub-calls reaching target directories; arbitrary bash or program code is not parsed, and automatic discovery of file accesses performed directly within shell commands is not guaranteed;
3. the wire keeps one presentation for the entire session, selected by `presentation`: `both` (the default) keeps the native roster and the `run_code` transport co-resident, balancing native accuracy and programmatic execution; `ptc` collapses the wire to `run_code`; `native` carries the assembled native roster; `ptc` and `both` need a mounted code runtime; without one the plugin declares no presentation at all and the session simply runs the native surface. The legacy `ptcPresentation` key maps onto `ptc`/`native` with a deprecation warning, and the retired `anchorTools` first-turn narrowing no longer engages — setting it warns;
4. `tool-catalog` appends the tool list as a durable user message after the user's message, preserving complete input and output key parameter semantics (`descriptionMaxLength: 200` caps only the one-line summaries). It names exactly the tools the current request opens — the native roster, plus `run_code` when it is co-resident — and, under tool paging, adds one-line summaries for the namespaces whose tools are held back. Under `ptc` the summaries name namespaces that are genuinely unreachable — neither listed in the request's `tools:sdk` section nor callable from inside a `run_code` program — until `tool_activate`; It republishes only when that surface changes or the published copy left the visible surface (a compaction, a resume);
5. tools stay resident on the wire out of the box; when configured with `pagedToolPatterns`, gentle tool paging holds matching tools off the wire until activated: calling `tool_activate` restores the namespace from the next request on, keeping at most three active namespaces at once (activating a fourth evicts the least recently used back to summary). Activation state is rebuilt from the durable event stream across compactions and resumes;
6. a minimal working-context line — plan-mode state, active paged namespaces, and in-progress todos — is injected at the tail of the latest message only when its sources are readable, keeping current state inside the model's local attention window; runtime contexts (the sandbox and approval snapshots) and the skill catalog flow as in Standard mode;
7. the catalog groups the tools of an activated paged family under a `namespace `<name>` (activated):` heading instead of scattering one server's tools through the alphabetical list, while every non-paged tool keeps its flat entry;
8. `maxResidentTokens` (default 6000) estimates the always-on-wire surface and warns once when it is crossed, naming the heaviest tools and `pagedToolPatterns` as the remedy. The guard never truncates: silently dropping a tool the session needs would trade a measurable context cost for an unmeasurable capability loss.

## Security model

This mode operates strictly within the official host security architecture and complies with sandbox policies:

- **Host sandbox constraints**: All file tools — the natively presented Standard file tools and any file operation a `run_code` program dispatches through the SDK — are subject to host file sandbox policies, inheriting the current session's sandbox level (e.g., `danger-full-access` or workspace-restricted/read-only). Bare local filesystem access does not exist (no `dsh-fs-local` mount); all reads and writes across workspaces are guarded by host policy.
- **Standard shell on both platforms**: the preset mounts the upstream standard Stdio shell stack on every host, mirroring the builtin Standard preset. POSIX mounts `bash` (`@deepseek-ai/dsh-tool-bash`); win32 mounts `pwsh` (`@deepseek-ai/dsh-tool-pwsh`). Each platform exposes exactly one shell tool (`bash` on POSIX, `pwsh` on win32), featuring active-voice description title cards and deterministic exit codes. The preset ships no shell implementation of its own.
- **Code runtime sandbox**: `run_code` programs execute within an isolated worker thread context, with access to system resources strictly bounded by the SDK's exposed tools.

## The lever

The browser half adds a slot-machine lever to the composer tool row, immediately left of the model selector, on the new-session screen:

- pull the lever down — drag it, click it, or press it with the keyboard — and the session about to start composes LiangShen mode; a landed pull plays the jackpot burst (flash, shockwave, sparks, and a banner reading 梁神模式 over classical Chinese, binary, and Morse lines);
- push it up and the preset you were on before comes back — with nothing remembered yet, that is the deployment default;
- the arm always reports the session's real preset, so a reload shows the true state, and the lever renders only while the session is still blank — in a session that has started, the host refuses to recompose, and the row disappears from the composer entirely;
- a refused switch prints the host's reason under the lever and never plays the burst, and `prefers-reduced-motion` keeps the state change while dropping the animation.

The lever drives the session's preset through the agent-preset Remote namespace the browser session is already authenticated for, so it needs no additional permissions. It acts on the preset only while the session is blank, which is exactly the new-session screen it renders on.

## Preset configuration

The preset-local plugins are configured in `agent.cordis.yml`:

| Key | Default | Behavior |
| --- | --- | --- |
| `keepPlanPolicy` | `true` | Keep plan mode's `plan:policy` section in the otherwise one-line system prompt. Set `false` for the strict one-line surface, which leaves plan mode with no policy text behind it. |
| `instructionSource` | `host` | Where workspace instructions reach the model. `host` (the default) appends no section of its own and leaves the harness's agent-instructions injection untouched, so the instructions arrive as the harness's own user-role messages: one persistent baseline plus incremental additions, replacements, and removals as directories are touched; `system-prompt` reads the AGENTS.md-style chain at assembly time and appends it to the system prompt (the harness's own injections are dropped); `hint` replaces the first injection with a one-time non-imperative reference-file hint and drops later ones. |
| `instructionMaxBytes` | `65536` | Byte budget for the rendered workspace-instructions section, used only in `system-prompt` mode: broadest files are omitted first, the most specific file is truncated last. |
| `descriptionMaxLength` | `200` | Cap for one tool's one-line summary in the injected catalog. Complete key parameter semantics remain fully preserved. |
| `presentation` | `both` | Wire presentation for the whole session. `both` (the shipped default) keeps the full native roster and adds `run_code` co-resident, balancing native accuracy and programmatic capability; `ptc` collapses the wire to `run_code`; `native` keeps the assembled native roster. `ptc` and `both` need a mounted code runtime and degrade to `native` with a one-time warning when missing. |
| `pagedToolPatterns` | `[]` | Preset default is empty (all tools resident and available out of the box); when configured with glob patterns, matching tools are held back from the wire until activated through `tool_activate({ namespace })`. Held-back namespaces appear in the catalog as one-line summaries. At most three paged namespaces stay active at once, rebuilt from the event stream. |
| `maxResidentTokens` | `6000` | Estimated-token ceiling for the always-on-wire surface (the serialized schemas at roughly four characters per token), calibrated above the shipped roster so it flags real growth rather than the factory configuration. Crossing it warns once, names the heaviest tools, and points at `pagedToolPatterns`; it never truncates the roster. |
| `ptcPresentation` | (retired) | Legacy alias: `true` maps to `presentation: 'ptc'` and `false` to `'native'`, both with a deprecation warning. |
| `anchorTools` | (retired) | First-turn anchor narrowing is removed; setting this key warns and no longer narrows the wire. |

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

- with `instructionSource: host` the first header's `system` should be exactly the persona block (the minimal persona, the working-discipline list, and the workspace line `Your working directory is <cwd>.`) plus plan mode's policy while plan mode is on — while the AGENTS.md chain arrives as the harness's own user-role message; under `instructionSource: system-prompt` the `system` carries one extra `workspace-instructions` section instead;
- every header keeps the same presentation for the whole session: under the default `presentation: 'ptc'` the wire carries `run_code` alone, and no turn boundary ever collapses the wire further;
- the admitted messages hold one `plugin`-sourced message from `liangshen-tool-catalog` after the user message, naming exactly the tools the request opens by argument signature; tools held back by paging appear as one-line namespace summaries instead;
- under `ptc` an unactivated namespace is absent from the request's `tools:sdk` section and cannot be called from inside a `run_code` program — from the FIRST request on, not one request later;
- after `tool_activate({ namespace })` succeeds, that namespace's tools join the wire from the next request, and no more than three paged namespaces are active at once;
- after a compaction the catalog is republished once as a replacement list, paged activations are rebuilt from the durable event stream, and the presentation mode is unchanged;
- file writes obey the host file sandbox policy — there is no bare local-filesystem bypass.

### Real session validation conditions and benchmark evaluation

When validating mode behavior and evaluating performance, verification tiers must be strictly distinguished:

1. **Real inference probe ≠ Mode integration pass ≠ Statistical improvement**:
   - **Real inference probe**: Verifies only transport connectivity and minimal model response capability to specific formats (e.g. using a headless probe to verify output parsing); a single successful probe demonstrates absence of blockers, but never that mode integration has succeeded.
   - **Mode integration pass**: Requires full session verification of complete headers, the configured presentation behavior, paged activation and eviction, SDK parameter semantics under `run_code`, and sandbox policy enforcement.
   - **Statistical improvement**: Must be evaluated across multiple comparative benchmark rounds in an isolated environment with recorded fixed routes and source hashes, evaluating task completion rate, tool failure rate, rule violation rate, human intervention frequency, and time/token costs. Single or few smoke runs do not constitute evidence of performance improvement.
2. **Benchmark tooling**: the isolated runner is `packages/dsh-liangshen/tools/benchmark-live-run.mjs`. It writes the evaluated preset into a temporary root selected through the roster's own `roots` config, redirects session persistence into the run directory, and records a baseline (repository commit, shipped preset hash, DSH version, fixed route, task revision) with every run. The candidate matrix isolates the persona and the presentation strategy: `B` (shipped defaults), `P` (candidate persona), the presentation arms `T` (candidate persona, PTC from the first turn) and `N` (candidate persona, full native roster throughout), and `M` (the bundle's official Minimal preset, an external reference rather than a single-factor arm). Run one smoke case with `node tools/benchmark-live-run.mjs --variant B`, or the bounded matrix over the seed corpus with `node tools/benchmark-live-run.mjs --tasks tools/tasks/liangshen-v41-flash.json --groups B,P,T,N,M --repeat 3 --max-sessions 60 --budget-usd 5`; aggregate the run records in a results directory with `node tools/benchmark-report.mjs .benchmark-results`, which reports per-group success rates with Wilson intervals, paired per-task deltas with confidence intervals, token and cost totals, infrastructure failures separately, and the recorded baseline. Smoke runs validate the protocol and the cost estimate; they are not evidence of a general coding gain.

## Configuration

| Key | Default | Behavior |
| --- | --- | --- |
| `enabled` | `true` | Master switch: when false, neither preset sync nor announcement runs. |
| `announceToAgent` | `false` | Opt-in: when true, a system-prompt section announces the plugin. Off by default so agent system prompts stay clean. |
| `presentation` | `both` | Wire presentation written into the synced preset's `tool-catalog` row: `both` (default) keeps the roster and transport co-resident; `ptc` collapses the wire to `run_code`; `native` keeps the assembled roster. A change takes effect on the next DSH start, when the preset is re-synced. |

All fields are editable in the web settings surface (plugin config) or through the profile patch (`dsh plugin` / `cordis.patch.yml`). The preset-shaping presentation field reaches a session through the preset sync: the plugin writes it into the synced `agent.cordis.yml` as it copies the bundle, so the settings surface — not the bundled file — is what the operator's sessions actually run. A key the composition does not carry is never invented: the overlay only narrows the shipped configuration. Restart DSH for a change to take effect.

## Behavior and limits

- The system prompt is stable for the whole session: the persona block (persona, working discipline, workspace directory), plus plan mode's policy while plan mode is on, plus the workspace-instructions section in `system-prompt` mode. Nothing is appended after a tool call, and no output-token cap is applied;
- In `system-prompt` mode the workspace-instructions section is re-read at every assembly, so instruction-file edits propagate on the next request without a durable message; the section renders last, after the stable prefix, so the cache prefix stays intact. Subdirectory dynamic rules will subsequently support registered file tools (including `str_replace_editor`) and `run_code` sub-calls reaching target directories; arbitrary bash or program code is not parsed, and automatic discovery of file accesses performed directly within shell commands is not guaranteed;
- The wire keeps the same presentation for the entire session — there is no turn-boundary transition: `native` carries the assembled native roster, `both` adds a co-resident `run_code`, and `ptc` (the default) collapses the wire to `run_code` alone with every other tool reached through the generated SDK;
- The injected catalog is durable: it is written once per session, plus one replacement when the tool surface changes (a paged activation, a presentation change) or a compaction shadows the published copy, and it stays in the history for later requests;
- A step whose prompt assembly was not observed injects nothing — the catalog is never guessed from a stale view;
- A composition exposing none of the accepted persona section names (`deployment:persona-prefix`, `deployment:persona`, `persona`) keeps the assembled prompt and warns once instead of sending an empty system prompt;
- Plan mode is supported through its `plan:policy` section; with `keepPlanPolicy: false` the mode keeps its tool but loses the policy text that enforces it;
- Paged tools (default pattern `mcp__*`) stay off the wire until the model activates their namespace through `tool_activate`; at most three paged namespaces are active at once, activating a fourth evicts the least recently used one back to its summary, and activation state is rebuilt from the durable event stream after compactions and resumes;
- The working-context line is injected only when its sources (plan-mode state, active paged namespaces, in-progress todos) are readable, and omitted otherwise;
- Tool results are pruned once they exceed 4096 characters, keeping a 1500-character head and a 500-character tail, so oversized outputs do not crowd the context;
- `run_code` needs a mounted code runtime (the shipped web and headless compositions mount `dsh-code-runtime-worker-thread`); without one, `ptc` and `both` declare nothing and the session runs the native surface;
- The roster does not publish the `workflow` tool, while the workflow engine stays mounted for `ralph`;
- The shell mounts the upstream standard Stdio stack, registering `bash` on POSIX and `pwsh` on win32 — each host mounts exactly one shell tool, featuring concise description title cards and deterministic exit codes;
- The file tools inherit the host file sandbox (no bare `dsh-fs-local` filesystem);
- The preset carries the same trust level as shell access — review `presets/liangshen/` before installing;
- The plugin makes no network requests and adds no telemetry;
- Do not switch presets mid-conversation;
- Requires DSH 0.1.6-alpha.1+ (preset mechanism, the `system-prompt/assemble` waterfall, the persona `prefix` schema, and the PTC presentation API).

## License

Plugin body Apache-2.0 (zhu1090093659). `presets/liangshen/agent.cordis.yml` derives from the DeepSeek Harness builtin Minimal, Standard, and PTC presets (MIT) — copyright and license notices are kept in the preset's `NOTICE`.
