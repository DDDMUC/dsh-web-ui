# Blue-throated Bee-eater pet — validation record

Status: contribution validation snapshot (2026-09-07)

## What shipped

A new built-in sprite2d pet for dsh-pet:

- `packages/dsh-pet/assets/blue-throated-bee-eater/` — pet.json (manifest v2), spritesheet.webp (1536x1872 lossless webp, 8 columns x 9 rows of 192x208 cells), previews/<track>.gif x9 (192x208 animated).
- Row order and frame counts follow the hatch-pet contract: idle 6 / running-right 8 / running-left 8 / waving 4 / jumping 5 / failed 8 / waiting 6 / running 6 / review 6 (frames [6, 8, 8, 4, 5, 8, 6, 6, 6]).
- Track durations ride the shared global slow rhythm baseline (all nine tracks declared in the manifest).
- All seven ActivityPhase sequences mapped; bee-eater voice remarks block (pet / petCooldown / feed / feedCooldown / noTreats).
- Artwork is repository-original (Apache-2.0), flat-illustration style, palette from the blue-throated-bee-eater skin tokens (azure #2b87d8, light azure #41a3e8, chestnut #b26a3b, deep blue-ink #0c2029, cream #eef6f9) plus a dedicated green-teal for the plumage.

## Generation

```
python3 docs/archive/blue-throated-bee-eater-pet/gen-pet.py
```

Deterministic Pillow renderer (Catmull-Rom spline shapes at 4x supersampling, LANCZOS downscale). Outputs the atlas, the nine preview GIFs, and contact-sheet.png. The generator lives under docs/archive (not inside the pet directory, so it never installs into $DSH_HOME/pets).

Evidence files in this directory: contact-sheet.png (full 57-frame grid), zoom-sheet.png, strip-idle.png / strip-runright.png / strip-front.png (per-cycle filmstrips), zoom-idle0.png / zoom-fly4.png / zoom-front2.png.

## Validation gates

| Gate | Command | Result |
| --- | --- | --- |
| Manifest + assets contract | `node scripts/dsh-pet validate packages/dsh-pet/assets/blue-throated-bee-eater` | PASS — "valid: blue-throated-bee-eater (renderer sprite2d)", zero diagnostics |
| Package build | `pnpm --filter @linxin666/dsh-pet build` | PASS |
| Package tests | `pnpm --filter @linxin666/dsh-pet test` | PASS (registry test asserts the new entry: id, displayName 蓝喉蜂虎, atlasRows 9, columns 8, rows [6,8,8,4,5,8,6,6,6], atlas file present; entries list pinned first alphabetically) |
| Typecheck | `pnpm typecheck` | PASS |
| Workshop build | `node scripts/market-build` | PASS — "wrote ... (29 skins, 6 pets, 54 plugins)"; new market/dist/assets/pets/blue-throated-bee-eater/ tree and pets.json rank-1 entry |
| Workshop consistency | `node scripts/market-build --check` | PASS — "dist up to date" |
| Docs pairs | `node scripts/verify-docs.mjs --write dsh-pet` + `pnpm docs:check` | PASS (hashes re-recorded after the bilingual README updates) |
| i18n | `pnpm i18n:check` | PASS |

The root `pnpm test` suite was run in full; the only red gate was
`dsh-remote-web-ui tests/remote-api.spec.ts > returns a fixed 502 message instead of the upstream error text`
(a 5 s timeout). It reproduces identically on a clean origin/dev baseline with
this change stashed (verified before the PR), so it is a pre-existing
environment-dependent failure unrelated to the pet contribution; all 471
dsh-pet tests and every other package pass.

## Runtime note

The pet is a pure asset addition: no host/client code, no cordis.patch.yml change, no DSH restart required (a DSH web instance picks it up on the next boot or, for a user pets-dir install, on the next settings refresh).

## Real-GUI evidence

A scratch DSH web instance was booted (a full copy of the machine's working harness profile, DSH_HOME pointed at `.scratch-dshhome` with the pet copied into `pets/blue-throated-bee-eater/`; `pet.json` set to `petId: blue-throated-bee-eater`; booted with the real dsh CLI — note the machine's `bin/dsh` is a wrapper that hard-codes DSH_HOME, so the nested CLI at `node_modules/.bin/dsh` was used). Evidence captured with Playwright Chromium:

- `pets-api.json` — `/api/pet/pets` registry listing `ouo-neko`, `whale-girl`, `whale-girl-refined`, `blue-throated-bee-eater` (蓝喉蜂虎).
- `gui-pet-dock-a/b/c.png` + `gui-pet-animation-strip.png` — the docked pet rendered bottom-right over the blue-throated-bee-eater skin backdrop, three frames 600 ms apart showing distinct poses (wing-wave, head-turn, breathing) — animation runs.
- `gui-pet-settings.png` — the Settings > Pet card; this host's DSH version predates the settings-namespace bridge for the pet plugin (the card reports the form unavailable and the selector is edited through `$DSH_HOME/pet.json`), so the selector screenshot needs a current dev-stack instance; the selector data is the same `/api/pet/pets` listing above.

The instance was stopped and the scratch home removed after capture; the user's real homes were not touched apart from the documented `$DSH_HOME/pets/blue-throated-bee-eater` install (dsh-home).
