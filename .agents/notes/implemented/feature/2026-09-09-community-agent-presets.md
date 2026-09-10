# Agent Note: Community agent presets distributed through the Workshop

Status: implemented

## Problem

An agent preset is the composition a session runs: its tools, prompt sections, and skills come from the `agent.cordis.yml` inside a preset directory. The roster had exactly two sources — the presets shipped inside `@deepseek-ai/dsh-agent-presets` and directories a person places under `$DSH_HOME/.agent-presets` by hand — and the official Settings → Agent presets section only copies, deletes, sets the default, and opens a directory. There was no catalog, no download, no enable/disable, and no distribution path for a community author other than "copy these files into your DSH home".

The Workshop (`dsh-market`) already solved that shape for skins and pets: a manifest served by dsh-market.com, a loopback-only host gateway that downloads one asset into its DSH home directory with per-file sha256 provenance, and a settings surface that manages what is installed. Two properties of the preset domain made a naive copy of the skin flow wrong:

- **A preset is code, not an asset.** A composition may name relative files (`name: ./tool-bootstrap.mjs`) and evaluate `!!js` expressions; both run inside the DSH host process when a session is composed from the preset. The official package states the trust plainly: a preset carries the same trust as shell access. Installing must therefore never be the same act as running.
- **The official roster has no disabled state.** Every directory under a discovery root is listed in Settings → Agent presets and offered by the new-session picker, and discovery re-reads the roots on every call. "Disabled" can only mean "not present under any discovery root", which forces an explicit two-directory storage contract rather than a marker file.

## Decision

Community presets ship as a fourth market asset kind (`preset`) distributed by dsh-market.com, managed from a **预设 / Presets** tab in the Workshop card, with install and enable as separate acts.

### Storage and state contract

Two directories under `$DSH_HOME`, both documented as a cross-package contract:

| Path | Meaning |
| --- | --- |
| `agent-presets/<id>/` | **Library**: installed but inert. No discovery root scans it, so nothing in it is ever loaded. Carries `dsh-market.provenance.json`. |
| `.agent-presets/<id>/` | **Discovery root**: the harness-home user root the official roster already scans. Present means enabled. |

State is derived from the filesystem on every read, never from a private ledger: library present and root absent is installed-but-disabled; the reverse is enabled; both present is a conflict the panel reports and uninstall repairs; neither is not installed. Install downloads the market asset into the library (atomic staging plus rename, per-file sha256, never into a discovery root); enable moves the directory into the root; disable moves it back; uninstall removes whichever copies exist; update re-installs into the library and, when the preset is enabled, replaces the root copy in the same operation. Moves are atomic renames with a cross-volume copy-verify-remove fallback and a short retry for transient Windows handle failures. Updates are notify-only: the card shows an available version and the user runs the update.

### Trust model

- Install and enable are separate acts and separate consents. The library is inert by construction; enabling is the point where code can run.
- The gateway refuses to enable a preset whose id a shipped or configured root already supplies (that root wins discovery order, so enabling would look successful and do nothing), and refuses to disable or uninstall the preset named by the `agent-presets` default setting, because a default naming a missing preset makes every new session fail. The message points at Settings → Agent presets for changing the default first.
- Every card shows a **composition profile** computed on the host from the installed bytes: the plugin names it composes, whether it carries local code files (`.mjs`/`.js`), relative rows, or `!!js` expressions, and whether its dependencies resolve. A preset carrying any execution surface requires an explicit confirmation before enabling, and a read-only viewer renders the composition.
- Enabling is pre-checked and rolled back: after the move, a preset the roster reports broken is moved back to the library and the reason is returned instead of leaving a half-enabled preset.
- Provenance is the integrity anchor, as for skins: the workshop records the market version and per-file sha256 at install, reports "本地已修改" when bytes no longer match, and never silently overwrites a locally modified preset.
- The routes answer only loopback requests, and a directory without market provenance is untouchable: it is listed as unmanaged and refused by disable, uninstall, and install.

### Market channel and publishing

- Source of truth in this repository: `packages/dsh-preset-center/presets/<id>/` (the preset directory itself) plus `presets/catalog.json` (author, version, tags, English display text, ranking). Preset ids must match the official rule `^[a-z0-9][a-z0-9-]*$`.
- `scripts/market-build` emits `market/dist/manifest/presets.json` and `market/dist/assets/presets/<id>/`, and validates every catalog entry (id rule, reserved shipped ids, composition and metadata files present, `preset.yml` name readable) so a broken preset never publishes. The Chinese display text comes from `preset.yml` so the roster and the store cannot disagree; the catalog carries the English text and market metadata.
- `market/worker`'s asset allowlist maps `preset` to `/manifest/presets.json`; the worker's accepted-kind set and stats buckets needed the same registration, which the first published batch exposed ([Preset likes and installs were rejected by the worker](../../bug-fix/2026-09-10-preset-write-endpoints.md)).

### Ownership and UI

- `@linxin666/dsh-client-ui-preset-center` owns the preset domain: the host library state machine, the loopback-only routes under `/api/preset-center/*`, the composition profile, and the panel component.
- `dsh-market` keeps owning the store shell and the download: its installer gained the `preset` kind (target directory = the library), and its card declares the keyed child slot `dsh-workshop.panel` and renders one cell per contributed kind. The card passes the catalog records, the gateway, and the install reporter as owner props, so the store makes one catalog fetch and owns one gateway for every kind; the preset panel owns the kind-specific state machine behind them.
- Only enabled presets appear in Settings → Agent presets, by construction: the official section lists exactly the discovery roots, and a disabled preset lives outside them. No new first-level settings section exists, so the roster never has two management surfaces.
- The official section re-reads on its own actions, `settings/document-updated`, and `connection/reset`; a filesystem move from the workshop triggers none of them, so the panel tells the user that a page refresh surfaces a newly enabled preset.

## Alternatives considered

**Install directly into `$DSH_HOME/.agent-presets` and treat absence as disabled.** The simplest mapping onto the official model, and it removes the second directory. It was rejected because it destroys the two-step consent: a single click on a catalog card would place executable composition into a discovery root, where the next session can already be composed from it. It also makes "installed but not enabled" unrepresentable, which is the state the product needs for browsing a catalog safely.

**A marker file (`.disabled`) inside the discovery directory.** Rejected: the official discovery does not read it, so a disabled preset would still be listed in Settings → Agent presets and offered by the picker — the exact outcome the feature must prevent.

**Patching the host composition to add our own roots (`includeUserRoot: false` plus two roots).** Rejected as an invasive rewrite of another plugin's configuration: it would have to coexist with the trading profiles' `~/.dsh-trading-presets` root and with `dsh-liangshen`'s synced presets, and it would turn the disabled set into a second source of truth maintained by us.

**Symlinking the library directory into the discovery root.** Rejected: Windows requires elevated privileges or developer mode for symlink creation, and the discovery root would still carry a directory entry, so the benefit over a real directory move is nil.

**Distributing presets as npm plugin packages (the `dsh-liangshen` shape).** Rejected for community distribution: it puts preset content behind a profile patch and an npm install, requires a DSH restart to take effect, and gives the roster no per-item enable/disable surface — the opposite of the Workshop experience this feature is modeled on.

**Letting `dsh-market` own the whole feature instead of adding a package.** Rejected because the store would absorb the preset domain's state machine, guards, and composition profile, and every future manageable asset kind would grow it further. The child-slot contract keeps the store a catalog and the domain owner the domain owner.

## Consequences

- The Workshop card carries a fourth tab; without the preset center installed it renders a fallback note instead of the panel, so the store degrades rather than breaking.
- Enabling a preset makes it usable by a new session immediately (discovery re-reads its roots per call) but it may need a page refresh to appear in the official settings section.
- Disabling or uninstalling a preset never affects a session already composed from it, because a session's composition is fixed at creation.
- The catalog's first content is the 32-entry role-play batch recorded in [Roleplay preset catalog and its content boundary](2026-09-10-roleplay-preset-catalog.md); `packages/dsh-preset-center/presets/catalog.json` remains the publishing source, with the content requirements stated in `presets/README.md`. Review quality of a composition remains a human process; the confirmation gate and provenance reduce accidental risk, not hostile intent.
- A user can delete an enabled preset from the official section or by hand; the panel then reports it as not installed, so "uninstalled" and "deleted elsewhere" are indistinguishable by design.
- Moving a directory the host process still has open can fail transiently on Windows; the move path retries and reports a write error instead of leaving a partial state.

## Testing

- `packages/dsh-preset-center` covers the state machine (install/enable/disable/uninstall, conflict, unmanaged refusals, atomic move), provenance integrity, the composition profile, the loopback gateway over a real HTTP server (confirmation gate, shadowed id, default-preset refusal, broken-preset rollback, roster unavailability), and the panel (state badges, install/enable/disable flows, confirmation modal, empty and gateway-unavailable degradation).
- `packages/dsh-market` covers the `preset` installer kind (library target, discovery root untouched, recorded asset version, id rule), the gateway `install-preset` route, the card's preset tab owner props, and the section's child-slot declaration.
- `scripts/market-build` validates the catalog on every build; `pnpm market:check` compares the committed `market/dist` against a fresh build.
