# dsh-web-ui · DSH Web GUI Plugin Family

[中文](README.md) | English

![dsh-web-ui](docs/dsh-web-ui-banner.png)

dsh-web-ui is the plugin family for the DeepSeek Harness (DSH) Web GUI, featuring both feature plugins and interface skins: a task board, a Git graph, a whale-girl pet, live token statistics, and the Skin Center. Every plugin can be installed individually, or all at once through the aggregate packages.

![DSH Web GUI main screen](docs/screenshots/13-hero-main.png)

## Feature Plugins

### Task Board

Open it from the sidebar. Tasks are organized into five columns: Planned, To-do, In Progress, Done, and Failed. Clicking "Run" on a card hands the task to a real DSH agent session; when it finishes, the card status updates automatically. To review what happened, jump directly into the execution session for the full transcript.

Tasks also support scheduled execution: configure a cron expression in the detail view (e.g. auto-upgrade DSH at 23:00 daily, generate a weekly report at 09:00 every Monday), and the task runs on its own at the scheduled time.

| Multi-column board | Scheduled execution |
| --- | --- |
| ![Task board](docs/screenshots/09-task-board.png) | ![Scheduled task detail](docs/screenshots/10-task-board-detail-cron.png) |

### Git Graph

The branch picker above the input box handles branch switching and commit history browsing; the Git graph visualizes branch lanes and commit history, making it easy to trace changes along the timeline even in large repositories.

![Git graph](docs/screenshots/04-git-graph.png)

### Whale-Girl Pet

A whale girl who lives at the edge of the interface and switches animations with the agent's state: thinking, waiting, working, celebrating. Click her to interact (pet her head), feed her dried fish to raise affinity, and grow her from a baby whale to "deep-sea bond". She can be renamed, dragged to any position, or hidden whenever you want.

| Working companion | Interaction panel |
| --- | --- |
| ![Whale pet](docs/screenshots/11-pet-new-chat.png) | ![Pet interaction panel](docs/screenshots/12-pet-panel.png) |

### Live Token Stats

Real-time usage shown directly below the input box: generation speed (TPS), LLM time, context usage, cache hit rate, and input / output token counts — the cost of every generation stays visible at a glance.

![Live token stats](docs/screenshots/18-live-stats.png)

### Settings Hub

All family plugins' toggles and parameters live under "Settings > Plugin config", and changes apply immediately.

![Plugin config hub](docs/screenshots/02-settings-web-ui-plugins.png)

## Skins

The skin center ships six skins, each supporting try-on before applying: preview applies instantly and reverts fully on exit; once you are satisfied, apply it with one click.

![Skin center](docs/screenshots/03-settings-skin-center.png)

### Windows XP (Luna)

A faithful recreation of the classic Luna interface: blue gradient window chrome, a green Start button, the Bliss blue-sky desktop, and square corners throughout.

![Windows XP skin](docs/screenshots/16-skin-xp-light.png)

### Minecraft Voxel

Inspired by the Minecraft main menu: a pixel-art panorama skybox rotates slowly behind the interface, buttons adopt the gray stone slab style, and inputs become wooden sign posts.

![Minecraft skin](docs/screenshots/15-skin-minecraft-light.png)

### Blue Fantasy

Whale artwork lies beneath translucent panes, wrapped in a periwinkle-indigo palette — particularly striking in dark mode.

![Blue Fantasy dark](docs/screenshots/17-skin-blue-fantasy-dark.png)

Three more: QQ2008 Retro (crystal blue with penguin motifs), Tonghuashun Trading (market elements woven into the interface), and Dragon Heir (cinnabar dragon seal theme).

## Installation

Install everything at once through the aggregate packages: `web-ui-all` includes all plugins and skins, `dsh-skins` includes skins only. Technical details live in [docs/plugins.md](docs/plugins.md).

## Sources & Licensing

| Package | Origin | License |
| --- | --- | --- |
| task-board / git-graph / pet / remote-web-ui / live-stats | dsh-external org-owned | BSD-3-Clause (dsh-external contributors) |
| skins / dsh-skins / web-ui-all | Native to this repo | BSD-3-Clause |

Third-party code merged in must keep its LICENSE and attribution; active third parties with an upstream are forked or referenced as dependencies instead of vendored.
