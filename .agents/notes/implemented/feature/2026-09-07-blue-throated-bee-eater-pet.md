# Agent Note: Blue-throated Bee-eater pet contribution

Status: implemented

## Problem

The blue-throated-bee-eater skin (azure #2b87d8 brand, teal surfaces, chestnut warnings, CC BY-SA flight photograph backdrop) was merged through PR #1371. The natural companion contribution is a matching pet, but the ecosystem had no bee-eater sprite set: every existing pet (whale-girl, ouo-neko, starry-doll, miku) needs a 8-column x 9-row sprite atlas (192x208 cells, row order idle / running-right / running-left / waving / jumping / failed / waiting / running / review, frames [6, 8, 8, 4, 5, 8, 6, 6, 6]) plus per-track animated previews, and the skin only carries a single flight photograph that is unsuitable for a 9-state animation contract.

## Decision

Ship a new built-in sprite2d pet `blue-throated-bee-eater` (selector label 蓝喉蜂虎, author dsh-web, Apache-2.0) from `packages/dsh-pet/assets/blue-throated-bee-eater/`:

- **Original flat-illustration artwork** generated programmatically by `docs/archive/blue-throated-bee-eater-pet/gen-pet.py`: a pycairo two-pass renderer (opaque color pass with linear/radial gradient shading plus an A8 alpha pass for coverage and soft shadows, merged and downsampled from 8x supersampling), anatomy anchored on the Blue-throated Bee-eater (chestnut crown cap, black eye-mask band, white sclera with a blue-gradient iris and glints, azure throat patch, teal-green body, azure tail streamers, slender curved dark beak), palette taken from the skin tokens (#2b87d8 / #41a3e8 / #b26a3b / #0c2029 / #eef6f9) with a dedicated green-teal for the plumage; perched states sit on a twig perch with a soft contact shadow, wings are layered (coverts, secondaries, separated primary fingers with light edges; the far wing darker and semi-transparent in flight).
- **Animation design**: perched breathing/blinking idle, wing-wave, suspended head-up review, hover-to-camera front flap (the `running` track), long-wing flap loop for `running-right`/`running-left` (raised-V moment mirrors the skin photograph), jump leap, droop failed, head-tilt waiting.
- Manifest: petManifestVersion 2, 9 atlas rows, per-track durations at the shared global slow rhythm baseline, all seven ActivityPhase sequences, and a bee-eater voice remarks block (pet / petCooldown / feed / feedCooldown / noTreats).
- **Distribution**: bundled (npm `files` whitelist entry added, README built-in table and animation-preview tables updated in both languages) per CONTRIBUTING "随 PR 收录为内置宠物", and emitted into the Workshop catalog by `scripts/market-build` (new market/dist/assets/pets tree + pets.json entry) so users can also install on demand into `$DSH_HOME/pets/<id>`.
- Provenance: the generator, contact sheet, and validation record live in `docs/archive/blue-throated-bee-eater-pet/` (kept outside the pet directory so the installer never copies tooling into `$DSH_HOME/pets`).

## Testing

`node scripts/dsh-pet validate` passes the v2 contract with zero diagnostics; the registry test asserts the new entry (id, displayName, atlas geometry, atlas file presence) and green gates: dsh-pet build/test, typecheck, market:check, docs:check, i18n:check. A real-GUI scratch run (scratch DSH home + Playwright) rendered the docked pet in three animation frames over the matching skin backdrop, with `/api/pet/pets` listing the registry entry (see docs/archive/blue-throated-bee-eater-pet/).

## Alternatives considered

- **Photograph cutout derivative**: cutting the bird out of the skin's CC BY-SA flight photo and animating paper-doll transforms (the starry-doll precedent). Rejected: the green-on-green blurred background makes clean background removal unreliable without ML segmentation, the single gliding pose limits expression, and the derivative would carry CC BY-SA 4.0 for low visual value; original vector art is crisper and repository-owned.
- **frames2d layout**: miku-style named frame directories instead of the atlas. Rejected: the sprite2d 9-row contract matches the other atlas pets and the README preview tables; no gameplay block is needed for a companion pet.
- **Workshop-only delivery**: keeping the pet out of the npm bundle (the starry-doll precedent). Rejected because CONTRIBUTING's pet-contribution process clause records new pets as built-in, and the related skin is likewise a pure asset pack; bundling costs only ~140 KB.

## Consequences

The dsh-pet package asset footprint grows by the spritesheet (lossless webp) plus nine 192x208 preview GIFs; the registry entry list gains `blue-throated-bee-eater` first (alphabetical), which the registry test pins; the Workshop pets manifest gains a rank-1 entry whose previews follow the manifest track key order (idle first). The generator stays archival: it is deterministic and rerunnable but not wired into CI, so the committed assets are the source of truth.
