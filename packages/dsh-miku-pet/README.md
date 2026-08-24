# @linxin666/dsh-miku-pet

English | [中文](README.zh.md)

A floating companion pet exclusively for Miku: hand-drawn PNG frame animations
with work / shop / stat gameplay. It coexists with the built-in dsh-pet under
the `/miku-pet` namespace (entry id `miku-pet`, host routes `/miku-pet/*`).

## What it does

- **Miku-only frame animations**: idle (stop), scratch, blink x2, eat, drag,
  fall-and-stand-up (standup)
- **Random idle with pity timer**: while idle, a dice is rolled every 5 seconds
  with a 60% chance to play a random action; after 2 consecutive misses the
  next roll is guaranteed (driven by `assets/config.jsonc` weights)
- **Drag**: the drag pose loops while held; on release it plays the
  fall-and-stand-up sequence once and returns to idle
- **Click interaction**: a click plays a random blink / scratch reaction with a
  speech bubble and a floating `心情 +0.25` mood feedback
- **Work loop + wallet**: the menu's "Work" runs a continuous loop — every 10s
  one round is judged (+3 coins on success / -1 on failure) until interrupted;
  the wallet never goes below 0
- **Shop**: the menu's "Shop" opens a centered modal; coins buy food that
  restores hunger (small +40 / large +80)
- **Stat bars**: hovering shows hunger / mood / energy bars (0-100); hunger
  decays 1 per 60s (5 while working) and mood decays 0.5 per 60s; clicking
  raises mood by 0.25
- **Two-level hover menu + rename**: hovering shows a small menu (name +
  rename / wallet / shop / work); the name is stored in localStorage
- **Free drag positioning**: dragging moves the pet anywhere and the position
  persists (localStorage), with a "back to corner" action
- **Multi-instance + configurable**: the settings section can add pets and
  change size / position instantly

## Install

### From the repository (development)

```sh
git clone https://github.com/zhu1090093659/dsh-web-ui.git
cd dsh-web-ui
pnpm install
pnpm -r build
dsh plugin --profile web add link:$(pwd)/packages/dsh-miku-pet
```

## Configuration

Gameplay pools and weights live in `assets/config.jsonc` (idle 40 /
categories 60, 5s dice, pity timer, drag / standup / clicks pools, phrases).

## Known limitations

- Frame assets are served as WebP (q90, 1024px); user-provided PNG frames in
  the DSH home animation directory remain supported.
- The custom work / shop / stat gameplay is plugin-specific; it does not map
  onto the built-in dsh-pet pet registry model.

## License

MIT. Adapted from [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)
(MIT); the Miku art and gameplay code are new additions in this package.
