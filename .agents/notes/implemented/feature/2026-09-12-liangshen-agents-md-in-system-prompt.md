# Agent Note: LiangShen mode lifts the AGENTS.md instructions into the system prompt

Status: implemented

Partially superseded by [restoring foundational anchor tools and refining PTC semantics](2026-09-12-liangshen-anchor-tools-and-ptc-refinement.md) on dynamic instruction scope: notes upcoming support for registered file tools (including `str_replace_editor`) and PTC internal calls.

Partially supersedes [minimal persona plus an injected standard tool catalog](2026-09-11-liangshen-minimal-prompt-tool-catalog.md) on the instruction half: the agent-instructions hint is no longer this mode's default. That note's persona, injected-catalog, and message-source decisions all still hold.

## Problem

The mode's only channel for workspace instructions was a one-time context hint (`Reference documents exist: ... the task itself never depends on them`) plus the model reading files on demand. The framing was deliberate — the upstream anchored-standard eval (dsh-anchored-standard #49, E1/E1.5/E2) measured a full-text AGENTS.md dump flipping the anchored trajectory — but in practice the hint told the model the instructions never matter, and sessions drifted from the user-global and repository conventions until they happened to read the files. The owner wants the instruction content to carry standing weight in the one place the mode already keeps authoritative for the whole session: the system prompt, not a per-session context injection.

## Decision

`presets/liangshen/minimal-prompt.mjs` reads the workspace-instruction files itself at prompt-assembly time and appends them to the system prompt as one `workspace-instructions` section; the harness's agent-instructions injections are dropped entirely. `instructionSource` replaces `instructionHint` in the plugin config, defaulting to `system-prompt`; `instructionSource: 'hint'` restores the previous pointer behavior verbatim.

- Discovery mirrors the harness's baseline chain (`dsh-agent-instructions`): `$DSH_HOME/AGENTS.md` (displayed `~/.dsh/AGENTS.md`, or `$DSH_HOME` when the home is non-default), then `AGENTS.md` / `CLAUDE.md` and the `.local` overlays from the project root — the nearest ancestor holding a `.git` marker, or the cwd itself — down to the session cwd, broadest first, deduplicated per directory by trimmed content, with the same 1 MiB source cap. The baseline chain is the whole surface: the harness's dynamic reconciliation of descendant instruction files is not reproduced (see Consequences).
- Budgeting mirrors the harness's precedence under `instructionMaxBytes` (default 65536, the same number the preset's `agent-instructions` row ships): when the whole chain does not fit, the broadest files are omitted first and the most specific file is truncated last, at a UTF-8 boundary, with a marker line recording what was dropped.
- The section rides the assembly as `{ name: 'workspace-instructions', text: '{{workspace_instructions}}' }` plus `variables.workspace_instructions` carrying the rendered text. The harness's `renderPrompt` interpolates every section strictly — an unknown `{{name}}` reference throws and would fail every request the moment an instruction file contained a `{{...}}` example — while a variable's value is inserted verbatim and never re-scanned. Overriding the waterfall result is the documented extension point ("the returned waterfall value is authoritative").
- Placement is last: persona block (persona, working discipline, workspace line), plan mode's `plan:policy`, then the instructions. The dynamic section sits after the stable prefix, so the anchor's cache prefix stays intact.
- The read happens on every assembly with no per-session state, so file edits propagate on the next request, and compaction and resume need no republication. A read failure or a session without a cwd contributes no section; an unexpected error is warned once.
- The pre-step drops every `agent-instructions` message in this mode — baseline and dynamic alike — instead of the hint's first-message swap. The preset keeps the `dsh-agent-instructions` row mounted so `instructionSource: 'hint'` keeps working and its `maxBytes` remains that mode's budget; its composed messages are simply discarded by this plugin.

## Testing

- `tests/minimal-prompt.test.ts` runs against scratch `$DSH_HOME` / project directories: the appended section's name, position after the stable prefix, and variable indirection; `$DSH_HOME` and project-root-relative display paths; broadest-first ordering; candidate and overlay coverage with per-directory dedup; the baseline-chain boundary (a descendant `docs/AGENTS.md` is not included); per-assembly re-reading; budget omission and UTF-8-safe truncation; the degenerate-budget guards of the pure renderer; missing-cwd and unprobeable-cwd degradation; and that the harness's own `renderPrompt` renders the section verbatim including `{{evil}}` examples. The hint tests survive unchanged under `instructionSource: 'hint'`.
- `tests/preset-composition.test.ts` pins the shipped `instructionSource: system-prompt` and `instructionMaxBytes: 65536` rows.

## Alternatives considered

- Keep the hint as the default. Rejected by the owner: the pointer's non-imperative framing ("the task itself never depends on them") measurably de-motivates following workspace conventions, and the mode exists to make the system prompt the standing authority. The upstream evidence concerned a full-text dump as context injection, not standing prompt text.
- Capture the harness's injected message in the pre-step and re-emit its content as a prompt section from the next assembly. Rejected: the request loop runs `system-prompt/assemble` before the `agent/pre-step` waterfall (dsh-agent-loop), so the first request would carry neither content nor hint, and the cached copy would go stale against file edits between steps.
- Import the host plugin's exported `loadBaselineInstructions` from `minimal-prompt.mjs`. Rejected: preset-local plugin files load from `~/.dsh/.agent-presets/<id>/`, where bare specifiers cannot reach the harness's own dependencies — the harness resolves preset composition ROWS from its base, not imports inside a preset's files. Preset-local plugins therefore stick to node builtins, as `custom-bash.mjs` already does.
- Put the rendered content directly into the section text. Rejected: `renderPrompt` interpolates section text strictly, so any instruction file containing `{{...}}` (template examples are common in agent instructions) would throw on every request; the variable indirection carries the same text without scanning it.
- Keep the harness injections AND add the prompt section. Rejected: the model would see every instruction twice, once per channel, with divergent framing.
- Mirror the harness's dynamic touched-path reconciliation (nested instruction files surfaced on `read`/`write`/`edit` touches) as additional prompt content. Deferred: it needs `tools/result` tracking and descendant-directory state, and its trigger names are the Standard `read`/`write`/`edit` tools while this mode edits through `str_replace_editor` and, from the second turn, PTC programs — the mechanism would be near-inert here. The hint mode keeps the dynamic pointer behavior for deployments that want it.

## Consequences

- The session's first request no longer reproduces the builtin Minimal prompt shape: its system prompt is the persona block, plan mode's policy, and the instruction chain. The anchor's tool surface (`bash` alone, then PTC) is unchanged, and the instructions render after the stable prefix, so the cached prefix across requests still starts with the persona.
- Instruction content survives compaction and resume with no durable message and no per-session state; the hint mode's compaction re-arm machinery is unused in the default mode.
- The prompt grows by the instruction chain: about 16 KB on a session opened at this repository's root (user-global plus root `AGENTS.md`), within the 65536-byte budget.
- Descendant instruction files never reach the model in this mode: neither as prompt content nor as an injected pointer. A nested `AGENTS.md` (e.g. `packages/AGENTS.md`) discovered only through the harness's touched-path reconciliation is silently absent; the baseline root file remains the carrier for repo-wide conventions.
- The dropped injections do not enter the durable journal, so the harness plugin never sees its baseline as visible and recomposes it every pre-step — a bounded per-step file read that this plugin discards; acceptable at instruction-file sizes, and the price of keeping the hint fallback mounted.
- `instructionHint` no longer exists; compositions setting it fail config validation with a named error instead of silently changing behavior.
