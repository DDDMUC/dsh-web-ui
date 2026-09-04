# Agent Note: desktop runtime seed advances to 0.3.14

Status: implemented

Follow-through of the [desktop-launcher removal note](../simplification/2026-09-03-remove-dsh-desktop-launcher.md), which recorded that the desktop seed's `0.3.13` aggregate still pulled the launcher and "drops out naturally at the next aggregate bump". v0.3.14 is that bump.

## Decision

`desktop/runtime/profile-web/package.json` pins `@linxin666/dsh-web-all` `0.3.13` -> `0.3.14`; the `minimumReleaseAgeExclude` ledger re-rolls to the 19 family names at `0.3.14`, dropping the retired `@linxin666/dsh-desktop-launcher@0.3.13` entry (the 0.3.14 closure contains no launcher). `npm run build-runtime` re-staged the payload: `@deepseek-ai/dsh@0.1.2-rc.1 + @linxin666/dsh-web-all@0.3.14`, with the Node distributions unchanged (v24.20.0, cached).

One operational wrinkle: the first `build-runtime` attempt crashed mid-pnpm-install with a raw stdout buffer dump; an immediate clean rerun succeeded, so treat a single crash there as transient unless it repeats.

## Testing

- Staged tree lists exactly 19 `@linxin666` family packages and no `dsh-desktop-launcher`.
- `desktop/runtime/profile-web/pnpm-lock.yaml` resolves `@linxin666/dsh-web-all@0.3.14`.
- `git status` shows only the three seed source files; `resources/runtime/` stays git-ignored.

## Consequences

- The next desktop installer build (user-side, `npm run dist`) ships an rc.1 host with a launcher-free 0.3.14 family; no repo-side work remains before packaging.
- The exclude ledger must be re-rolled on every future family release the seed adopts (established pattern).
