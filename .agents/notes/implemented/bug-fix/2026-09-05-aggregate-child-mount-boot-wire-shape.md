# Agent Note: aggregate child mount gate misread the boot wire shape

Status: implemented

## Problem

The v0.3.15 #1372 fix ([multi-issue landing](2026-09-04-multi-issue-landing-1368-1370-1372-1359.md)) gated aggregate child mounting on per-row state read from `__DSH_BOOT__.entries`: a family child was skipped unless its patch row id (`web-ui-market`, `web-ui-plugin-manager`, ...) or a `@linxin666/dsh-web-all/<family>` subpath appeared among the active entries. That wire contract does not exist. The host composes boot entries from served client bundles only ([`graphRow`](../../../packages/dsh-git-graph/docs/ADR-001-plugin-boundary.md) wire shape: `id` is the bundle package name, plus `url`/`rev`/`inject`/`immediately`/`external` — no `name`, no `disabled`, never a patch row id), so on every aggregate install the gate found no row ids at all and skipped every family child. In the affected profile the entire dsh-web plugin family — Web plugin settings cards, Skin Center, Workshop, Pet, Task Board, Usage, Session Archive UI — vanished from the settings dialog at once, which is the reported critical regression.

The unit tests shipped with the gate fabricated boot payloads containing row ids (`bootWith(['web-ui-plugin-manager'])`), a shape the real host never produces, so the suite stayed green while the live GUI broke.

## Decision

`mountClientChildren` is restored to the pre-0.3.15 double-mount semantics: skip a child only when the child's own package id appears in `__DSH_BOOT__.entries` (that child is served through its own loader entry, e.g. standalone `@linxin666/dsh-session-archive` in the same profile), otherwise mount it. `CHILD_ROW_IDS`, the `name`/`disabled` boot-entry fields, and the row-state branch are removed. The module doc now records the actual wire shape and why boot entries cannot express per-row enable state.

Issue #1372 (hide UI entry points of disabled family rows) is effectively un-fixed by this revert and stays open until a real signal exists: the client would need a host-provided row-state channel (or a settings-inventory query), not the bundle graph. A regression test pins the real wire shape — a fully populated aggregate boot graph with package-name ids must still mount every family child. A follow-up design for the proper signal now lives in [family row-state route](../../proposed/feature/2026-09-05-family-row-state-route.md).

## Testing

- `packages/dsh-web-all/tests/client-children-mount.spec.ts`: new case mounts all family children under a real-shape boot graph (`@deepseek-ai/dsh-client-modules`, `@linxin666/dsh-web-all`, `@linxin666/dsh-perf` ids); the double-mount skip and registry tests keep passing; the row-id-based case was deleted as it asserted the broken contract. Package suite 26/26, repository `pnpm typecheck` and `pnpm test` pass.
- Live GUI (profile `web`, aggregate installed via repository link): after rebuilding `lib/client.js`, the mount registry held the 13 family children with standalone session-archive correctly skipped, and the settings dialog listed Web plugins, Skin, Pet, Workshop, Usage, and Session Archive sections again with the Workshop section rendering store content (skins 29 / pets 5 / plugins 5). Evidence: `/tmp/dsh-web-fix-evidence/settings-restored.png`.

## Alternatives considered

- Repairing the gate by matching more id spellings: rejected — the boot graph simply does not carry row state; any id-spelling variant still hides everything on real hosts while the tests keep fabricating the payload.
- Implementing the proper #1372 signal now (host exposes active family rows, client fetches before mounting): deferred — it is a new host-client contract, not a hotfix; the revert restores service first.

## Consequences

Aggregate installs mount their family UIs again on every host that serves the standard boot graph. Disabling a family row once more leaves its UI entry visible until #1372 lands on a real row-state signal; clicking such an entry degrades that child alone (the fault-isolation shell), it does not affect other plugins.
