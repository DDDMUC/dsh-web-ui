# Agent Note: Staging the LiangShen Standard catalog behind the anchor turn

Status: implemented

## Problem

The merged design ([minimal persona plus an injected standard tool catalog](2026-09-11-liangshen-minimal-prompt-tool-catalog.md)) put the builtin Standard preset's complete tool roster on the wire from the session's first request. Reading the first exchange in the trace view showed the cost: the initial system entry's tool tab carried the full Standard catalog before the conversation existed — precisely the premature injection the mode exists to avoid. The one-line persona was anchoring a request whose tool surface was already Standard, so the "minimal first wave" was minimal in prose only.

## Decision

The Standard roster is staged behind the anchor turn: the session's first turn runs the minimal surface, and the full catalog engages at the deterministic turn boundary. The staging lives in `presets/liangshen/tool-catalog.mjs`, the plugin that already owns the wire-catalog read.

- The anchor turn is defined from the durable log: fewer than two `turn/start` events. The count is read from the log on every decision, never from memory, so resume, reload, and compaction cannot lose or revive the boundary, and a first turn that ends without a reply still promotes at the next one.
- During the anchor turn the assembled wire tool list is narrowed to `anchorTools` before the request carries it, and the catalog message is neither published nor kept: the anchor schemas are already the whole wire, and a full-roster catalog would announce tools the request does not carry.
- From the second turn on, the full assembled roster is on the wire and the catalog publishes after the user's own message under the existing dedupe rules. An anchor-turn assembly stashes no entries, so a promoted step can never publish from a stale anchor view.
- `anchorTools` is preset configuration (`agent.cordis.yml`), defaulting to empty, which disables staging entirely and restores the full catalog from the first request. The shipped preset sets `bash`, `str_replace_editor`, `exit_plan_mode`, `skill`: the shell and editor are the minimal working pair the retired `tool-bootstrap` used to anchor with, `exit_plan_mode` backs the `plan:policy` section the prompt keeps, and `skill` backs the skill catalog that arrives with the first injections — every prompt reference in the anchor turn has its tool on the wire.
- Everything else about the first turn is unchanged: the one-line persona, the plan policy, the runtime contexts, the instruction hint, and the skill catalog.

## Testing

- `tests/tool-catalog.test.ts` covers the turn-boundary read, wire narrowing in anchor order, anchor-turn catalog suppression, stripping a catalog copy from an anchor batch, the second turn publishing the full roster, the stale-stash guard, and the default-off behavior.
- `tests/preset-composition.test.ts` pins the `anchorTools` row in the shipped `agent.cordis.yml`.

## Alternatives considered

- Keep the full roster from the first request. Rejected: that is the flagged premature injection.
- Gate promotion on a minimal-like first reasoning block, as the retired `tool-bootstrap` did. Rejected: a model-output-dependent state machine is the exact fragility phase 1 removed; the turn boundary needs no cooperation from the model.
- Publish an anchor catalog during the anchor turn and republish at the boundary. Rejected: the anchor schemas are already visible as the whole wire, so the first catalog would be noise and the journal would carry two durable lists per session start.
- Zero tools in the anchor turn. Rejected: the anchor turn should still be a working turn — shell and editor cover a real first task, and the surface then matches the phase-1 surface the mode shipped with originally.
- Suppress the skill-catalog message during the anchor turn instead of keeping `skill` on the wire. Rejected: that strips another plugin's injection from outside; keeping the tool keeps that catalog truthful.
- Promote on the first assistant message instead of the turn boundary. Rejected: a tool loop inside the first exchange would swap the surface mid-turn; the turn boundary keeps the whole first exchange on one surface.

## Consequences

- The first request is intentionally not fully capable: its reply can call only the anchor schemas. A task-first first message gets a shell-and-editor answer, and the full roster is available from the second exchange.
- The wire changes exactly once per session, so there is one catalog-driven prefix-cache break at the boundary and none within a turn or afterwards.
- Because the roster mounts the preset composition once under a standing scope at host startup, preset file changes take effect for sessions created after the next DSH restart; the plugin's startup sync refreshes the installed copies.
- The lever's row-hiding fix shipped in the same round ([the LiangShen lever](2026-09-11-liangshen-composer-lever.md)); the two address the same user report on different halves of the plugin.
