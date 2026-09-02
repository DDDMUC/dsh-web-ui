# Agent Note: 2026-09-03 maintenance run (two copy PRs merged, phoebe-atelier skin blocked on selector base)

Status: implemented

## Problem

The scheduled PR-maintenance pass over `zhu1090093659/dsh-web` found seven open
PRs assigned to `zhu1090093659`. Two documentation-only community-copy PRs
(#1333 dsh-session-insights, #1334 dsh-completion-guard) were blocked solely by
red CI from stale pre-09-01 heads (they predate the dev CI fix). #1349, a new
skin (phoebe-atelier) with hooks, was unreviewed. Four PRs (#1321, #1318,
#1306, #1144) remained waiting on their authors after maintainer
CHANGES_REQUESTED reviews with no new commits.

## Decision

- **#1333 and #1334 merged.** Verified the diffs are pure description-copy
  updates applied consistently to `community.json` and the regenerated
  `market/dist/manifest/plugins.json`. Both fork heads allowed maintainer
  edits, so `gh pr update-branch` rebased them onto the fixed dev; CI went
  green without admin bypass; approved and rebase-merged both.
- **#1349 (phoebe-atelier) CHANGES_REQUESTED** with three findings, verified
  against the PR head in a worktree:
  1. Blocking: ~470 of 511 selectors in `skin.css` key on
     `body[data-dsh-phoebe-atelier]`, an attribute only its own hooks set.
     The contract requires authors to key on `:root` /
     `body[data-ds-dark-theme]` (the loader scopes via
     `html[data-dsh-skin="<id>"]` before hooks run). Measured consequence: the
     market preview simulator (`preview.html?skin=phoebe-atelier`) injects the
     155KB stylesheet but renders the stock theme, because the simulator does
     not execute hooks; maid-atelier renders fully under the same conditions.
     The dsh-market.com try-on page is this simulator. The css url() fallbacks
     also use market-build paths (`assets/skins/phoebe-atelier/assets/...`),
     dead in the skin-center context.
  2. Blocking: the reviewed-hooks registry is split-brained —
     `src/reviewed-hooks.generated.ts` matches the actual files
     (manifest 76cfe0d3…, hooks f39b57db…, verified by shasum) while the
     committed `lib/index.js` carries stale hashes (830b56be… / 89df9a23…).
     The final "refresh to lf bytes" commit rebuilt only the src side;
     `provenance.ts` validates against the lib table at runtime, so the
     shipped host would reject the skin's hooks. Same stale-lib class as the
     #1316 incident.
  3. Trivial: a draft `pr-body.md` was committed at the repo root.
  Visual review passed: light/dark previews match the final state, and a
  zoomed inspection of the dark-mode halo found no clipping rectangle
  (pixel-step scan showed only organic falloff). hooks.mjs itself is clean:
  DOM-only decoration, no network/storage/eval, cleanup via ctx.onCleanup.
- **#1321, #1318, #1306, #1144**: read-only confirmation only — no commits
  since the maintainer reviews; no duplicate review, no remote actions.

## Consequences

- The community store copy for dsh-session-insights and dsh-completion-guard
  is now the plain-language version on dev.
- phoebe-atelier's fix belongs to the author (a substantive re-keying of the
  stylesheet base, not a maintainer-side patch); the registry/lib rebuild and
  the stray file removal ride along with that update.
- Reviewers of hook-carrying skins should test
  `market/dist/preview.html?skin=<id>` before approval: it is the documented
  acceptance gate and the only context that exposes hooks-owned selector
  bases, since real-GUI screenshots always have hooks running.

## Alternatives considered

- **Admin-merge #1333/#1334 without updating their branches** (the 09-01
  precedent for a maintainer-side dist gap): rejected here because both forks
  allowed maintainer edits, so a real green run on the updated head was
  available and strictly stronger evidence.
- **Maintainer-side fix for #1349's selector base**: rejected; re-keying ~470
  selectors is the author's design rework, and any maintainer-side registry
  rebuild would be invalidated by the author's next push anyway.
- **Silently merging #1349 and letting hooks carry the skin**: rejected; the
  try-on page is the store's user-facing front door, and the provenance
  mismatch would disable the hooks regardless.
