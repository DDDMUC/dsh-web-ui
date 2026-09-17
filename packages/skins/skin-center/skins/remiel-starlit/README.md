# remiel-starlit (Remiel Starlit)

English | [中文](README.zh.md)

A fan skin themed on a Zenless Zone Zero character: cherry-pink, ice-blue and
night-indigo translucent glass. Pale morning light in light mode (the `calm`
scene) and a nocturne indigo stage in dark mode (the `nocturne` scene), with the
full `--dsw-*` palette remapped in both states (static / alias / specific / aion).

## Install

The skin center is the only loader: install it (or the all-in-one aggregate),
then install this skin from the [Creative Workshop](https://dsh-market.com) into
`$DSH_HOME/skins/remiel-starlit/`, and try it on or apply it in
"Settings -> Skins". Switching is atomic and needs no restart.

## Layout

- `skin.json` — v2 manifest: `contributes.stylesheet` / `patches` / `backgroundMedia`
  (light -> `assets/remiel-calm.jpg`, dark -> `assets/remiel-nocturne.jpg`, each with its own scrim)
- `skin.css` — L1: base colour plus the full `--dsw-*` palette remap (light on `:root`, dark on `body[data-ds-dark-theme]`)
- `patches.css` — L3: scrollbars / selection / links / focus, the aion right panel, git-graph lanes,
  the composer, and the square settings-dialog backdrop (`[role="dialog"]` over `assets/remiel-settings-*.jpg`)
- `assets/` — scene art and the settings-dialog squares
- `NOTICE` — character provenance and artwork notice

This skin is declarative only: it ships no `hooks.mjs`; the backdrop and the dialog
square ride `contributes` and plain CSS.

## Preview

Light ([preview/light.jpg](preview/light.jpg)) · Dark ([preview/dark.jpg](preview/dark.jpg))

## Copyright

The depicted character is from Zenless Zone Zero, (c) miHoYo / HoYoverse. This is a
personal, non-commercial fan work; the artwork and palette are the author's, released
under CC BY-NC-SA 4.0. See [NOTICE](NOTICE).
