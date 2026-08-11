# @deepseek-ai/dsh-client-ui-skin-minecraft

A voxel take on the dsh web GUI, styled after the Minecraft main menu: a
procedurally drawn pixel-art panorama skybox (blocky hills, pixel clouds,
block trees, grass blocks) drifts slowly behind the app inside a CSS 3-D
cube — the same panorama motion as the game's title screen, drawn from
scratch rather than shipping Mojang's copyrighted textures. Buttons wear the
classic MC widget sprite (gray slab, black outline, yellow hover label,
press-down on click), inputs become sign posts (wooden plank with corner
nails), panels float as translucent slate, and the palette maps to lapis
blue, grass green, stone gray and gold sand.

Hot-pluggable as a client plugin in the official standalone bundle shape:
`apply()` sets the `data-dsh-minecraft` body attribute (the scope of the whole
stylesheet), renders the chrome, and pins the document title; its effect
disposer retracts every write. The stylesheet rides the bundle's CSS-modules
auto-inject, so the loader removes it with the entry.

The skin is presentation-only: no services are injected, no cordis events are
emitted, and nothing reaches a model request.

## Installing (official bundle)

1. Local path: `dsh plugin --profile <name> add /path/to/dsh-web-ui/packages/skins/minecraft`
2. Git: `dsh plugin --profile <name> add github:<org>/dsh-web-ui#<sha>` —
   pnpm ≥10 asks once for `allowBuilds` authorization (the `prepare` script
   self-containedly builds `lib/`; no monorepo reference needed).
3. Switch with `scripts/dsh-skin` (`dsh-skin use minecraft`); only one skin is
   ever active at a time.

## Building and testing

```sh
pnpm build   # tsdown: lib/index.js + lib/client.js (self-contained preset)
pnpm test    # vitest: apply/dispose contract spec
```

## Publishing to the skin center

```sh
node scripts/skin-center-bundles    # re-embed this skin into skin-center's registry
pnpm --filter @deepseek-ai/dsh-client-ui-skin-center build
node scripts/gallery-build          # refresh the gallery manifest/bundles
node scripts/capture-previews       # re-shoot preview/light.png + preview/dark.png
```

Then commit everything (lib/, preview/, regenerated registry/gallery) and open a PR.
