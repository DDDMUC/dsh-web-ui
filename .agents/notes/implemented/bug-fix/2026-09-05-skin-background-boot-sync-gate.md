# Agent Note: Skin Background Boot-Sync Gate

Status: implemented

## Problem

Issue #1375: on Windows, a hard refresh zeroed the five Skin Center background
sliders and persisted explicit zeros into `skin-center-active.json` (mtime
after the refresh; `inputCardBlur: 0` / `bubbleOpacity: 0` are not defaults,
so some client path held an all-zero in-memory snapshot and submitted the
whole `background` object). macOS with the same versions never reproduced.

Only the skin-center client submits a whole-background POST (setters, the
scope reconcile path, and the unload flush), so the zeros had to come from the
client's own in-memory state. The only state layer that can carry explicit
zeros is the legacy `skin-background` settings-namespace user layer: machines
touched by the pre-#1107 bug family still store stale zeros there, and
`migrateBackgroundFromSettings` copies once without clearing the layer. The
client's `reconcileScope` merged that layer back into the authoritative v2
state in two boot races:

1. Document arrives before the v2 GET completes: the `!v2Loaded` early return
   never recorded the publication, so after the GET the same revision+content
   looked like a fresh edit and was accepted.
2. Document arrives after the v2 GET: the boot resync was indistinguishable
   from a settings-page edit and was accepted outright.

Either order patched the live values with the stale zeros and
`persistBackground` wrote the whole zeroed snapshot back to the v2 file. A
machine whose legacy user layer is empty (the macOS case) always hits the
`currentUserJson === ''` rejection, which is why it never reproduced there.

## Decision

Moved the boot-order handling into a pure, unit-tested state machine in
`core/background-scope.ts` (`initialSkinBackgroundReconcileState` +
`reconcileSkinBackgroundPublication`) and made the client glue
(`client/index.ts`) a thin consumer. The boot document never merges, whichever
order it lands in:

- a publication seen before the v2 GET completes is only recorded, so the
  post-load check reads it as the unchanged boot snapshot;
- the first revisioned publication of the plugin's lifetime is consumed as the
  one-shot boot sync even when it lands after the GET — a genuine settings-page
  edit can only follow the document sync.

The existing fences are preserved unchanged: revision fencing, empty
user-layer rejection (#1184), content-based replay dedup (#1109), and merging
only explicitly stored user fields (#1107). The legacy namespace remains the
official settings page's input face; edits made after boot still forward into
the v2 store.

## Consequences

- A stale legacy user layer can no longer clobber or persist over the v2
  active state at boot; users affected by #1375 need to re-enter their values
  once (the file already holds zeros on those machines).
- A settings-page edit that would arrive as the very first revisioned
  publication (before any document sync) is dropped once; the next edit
  applies. In practice the document sync precedes any interaction.
- Client glue state shrinks to one typed state object instead of three loose
  `let` bindings.

## Testing

- New cases in `tests/background-scope.spec.ts`: boot document before the GET
  (both orders) never merges; WS replay with bumped revision stays rejected;
  genuine edits after the boot sync still merge.
- `pnpm --filter @linxin666/dsh-client-ui-skin-center test` (33 files, 607
  tests passed), package `typecheck` clean, package `build` regenerated
  `lib/client.js` and the aggregate `dsh-web-all/lib/client.js`.
