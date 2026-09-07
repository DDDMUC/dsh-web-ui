# Agent Note: Blue-throated Bee-eater pet contribution

Status: implemented

## Problem

The blue-throated-bee-eater skin (azure #2b87d8 brand, teal surfaces, chestnut warnings, CC BY-SA flight photograph backdrop) was merged through PR #1371. The natural companion contribution is a matching pet, but the ecosystem had no bee-eater sprite set: every existing pet (whale-girl, ouo-neko, starry-doll, miku) needs a 8-column x 9-row sprite atlas (192x208 cells, row order idle / running-right / running-left / waving / jumping / failed / waiting / running / review, frames [6, 8, 8, 4, 5, 8, 6, 6, 6]) plus per-track animated previews, and the skin only carries a single flight photograph that is unsuitable for a 9-state animation contract.

## Decision

Ship a new built-in sprite2d pet `blue-throated-bee-eater` (selector label 蓝喉蜂虎, author dsh-web, Apache-2.0) from `packages/dsh-pet/assets/blue-throated-bee-eater/`:

- **Companion artwork contributed by the repository contributor** under Apache-2.0: 12 AI-illustrated transparent pose references (source/ref-01..ref-12, same character, palette from the blue-throated-bee-eater skin tokens) assembled per track by `docs/archive/blue-throated-bee-eater-pet/gen-pet.py` (paper-doll placement, integer pixel-free transforms, per-track standalone poses: perched, flying V, front hover, wing wave, launch flare, touchdown, droop, head tilt, head-up review, eyes-closed blink).
- **Animation design**: perched breathing idle, wing-wave, suspended head-up review, hover-to-camera front hover, long-wing flight loops for `running-right`/`running-left`, landing sequence on the `jumping` row (done phase: cruise -> descend -> flare -> touchdown, contract row name kept as `jumping` per the shared hatch-pet contract), droop failed, head-tilt waiting with its blink beat; idle and front hover do not blink.
- Manifest: petManifestVersion 2, 9 atlas rows, per-track durations at the shared global slow rhythm baseline, all seven ActivityPhase sequences, and a bee-eater voice remarks block (pet / petCooldown / feed / feedCooldown / noTreats).
- **Distribution**: bundled (npm `files` whitelist entry added, README built-in table and animation-preview tables updated in both languages) per CONTRIBUTING "随 PR 收录为内置宠物", and emitted into the Workshop catalog by `scripts/market-build`; treats are labelled 小蜜蜂 through the per-pet `voice.json` panel override (feed button label stays the plugin default 喂食/Feed).
- Provenance: the generator, contact sheet, and validation record live in `docs/archive/blue-throated-bee-eater-pet/` (kept outside the pet directory so the installer never copies tooling into `$DSH_HOME/pets`).

## Testing

`node scripts/dsh-pet validate` passes the v2 contract with zero diagnostics; the registry test asserts the new entry (id, displayName, atlas geometry, atlas file presence) and green gates: dsh-pet build/test, typecheck, market:check, docs:check, i18n:check. A real-GUI scratch run (scratch DSH home + Playwright) rendered the docked pet in three animation frames over the matching skin backdrop, with `/api/pet/pets` listing the registry entry (see docs/archive/blue-throated-bee-eater-pet/).

## Alternatives considered

- **Photograph cutout derivative**: cutting the bird out of the skin's CC BY-SA flight photo and animating paper-doll transforms (the starry-doll precedent). Rejected: the green-on-green blurred background makes clean background removal unreliable without ML segmentation, the single gliding pose limits expression, and the derivative would carry CC BY-SA 4.0 for low visual value; original vector art is crisper and repository-owned.
- **frames2d layout**: miku-style named frame directories instead of the atlas. Rejected: the sprite2d 9-row contract matches the other atlas pets and the README preview tables; no gameplay block is needed for a companion pet.
- **Workshop-only delivery**: keeping the pet out of the npm bundle (the starry-doll precedent). Rejected because CONTRIBUTING's pet-contribution process clause records new pets as built-in, and the related skin is likewise a pure asset pack; bundling costs only ~220 KB.
- **Procedural redraws (flat PIL, gradient pycairo, programmatic pixel art)**: attempted to full depth and rejected by the contributor on visual grounds (reached the procedural ceiling; the AI-illustration route is the shipped variant). The pixel pipeline is archived as gen-pet-pixel.py with pixel-parts.png / pixel-style-gate.png evidence.
- **Contract rename jumping -> landing**: rejected — `jumping` is the shared hatch-pet row name used by every existing pet; the landing semantics ride the same row (per the contributor rule, repository conventions stay).
- **Pet bubble skin-token colors**: attempted and reverted — the shared pet client chrome stays untouched, bubble palette remains the plugin's blue family.

## Consequences

The dsh-pet package asset footprint grows by the spritesheet (lossless webp) plus nine 192x208 preview GIFs; the registry entry list gains `blue-throated-bee-eater` first (alphabetical), which the registry test pins; the Workshop pets manifest gains a rank-1 entry whose previews follow the manifest track key order (idle first). The generator stays archival: it is deterministic and rerunnable but not wired into CI, so the committed assets are the source of truth.
