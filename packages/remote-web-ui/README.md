# DSH Remote Web UI

> 移动端远程控制：扫码配对后，用手机远程使用当前 dsh web 工作区。

This repository is an external plugin package for DeepSeek Harness (DSH):
scan-to-pair mobile remote control for the dsh web GUI. It is a single
dual-face package — the host half owns pairing tokens, device sessions, and
the `/api/pair` route family; the browser half renders the sidebar-foot
entry (phone icon beside the settings button) and the pairing panel with a
QR code, live device status, and stop/refresh/copy actions.

## What it does

- **Entry**: a phone icon in the sidebar foot, next to the settings button.
- **Panel**: "移动端远程控制" title, "扫码或在手机上打开链接，即可远程控制当前工作区"
  subtitle, a "手机扫码连接" card with the status area ("等待手机连接" + status
  badge), a large QR code, the "无法扫码？可以在手机上打开链接" hint, and three
  buttons: 停止 / 刷新二维码 / 复制链接.
- **Phone side**: scanning the QR opens the full dsh web UI on the phone
  (responsive small-screen rendering — no separate light client), paired
  with a one-time, time-limited token. The link carries a `workspace`
  parameter so the phone lands in the same workspace the desktop was
  looking at.
- **Security**: one active one-time token (a refresh invalidates the old
  link; an accepted token cannot be reused; tokens expire). 停止 revokes
  every paired device and the current token — paired devices are cut off on
  their next request. When the plugin's `requirePairingForLan` gate is on
  (default), every non-loopback `/api` request must carry a live paired
  device cookie, so the QR is the only way into a LAN-exposed dsh web.
- **Live status**: the desktop panel mirrors the pairing state in real time
  (waiting → connected → disconnected) over an SSE stream.

## Requirements

- A DSH installation whose `dsh` CLI supports profiles (`dsh --profile`,
  `dsh plugin`) — the profile/bundle mechanism this package rides on.
- The server must be reachable from the phone: start with
  `dsh web --host 0.0.0.0`. With the default `127.0.0.1` bind the panel
  shows an explicit explanation instead of a dead QR code. The panel's
  mint/stop endpoints are loopback-only by design: a desktop browser
  opened at the LAN URL sees a "配对面板仅限本机使用" banner instead —
  open the panel at `http://127.0.0.1` and let the phone use the paired
  link.

## Install

```sh
# From a local checkout (the development loop — link: picks up rebuilds
# without reinstalling):
dsh plugin --profile web add link:/path/to/dsh-web-ui/packages/remote-web-ui

# From git, with no checkout: the prepare script builds lib/ during install
# (pnpm ≥10 blocks that build until you allow it; copy the printed key into
# the profile's pnpm-workspace.yaml allowBuilds and re-run). The repository
# is private, so git access needs a credential helper with org access:
dsh plugin --profile web add github:dsh-external/dsh-remote-web-ui
```

Restart the profile (`dsh web`), then open the phone icon in the sidebar
foot. The plugin's `cordis.patch.yml` inserts the single plugin row that
mounts both halves.

## Use

1. `dsh web --host 0.0.0.0` (the printed LAN URL confirms reachability).
2. Click the phone icon → the panel mints a fresh one-time QR.
3. Scan with the phone (or open the copied link): the phone binds and
   reloads into the full UI, landing in the current workspace.
4. The desktop badge flips to 已连接 in real time; it falls back to
   offline/断开 when the phone leaves.
5. 刷新二维码 invalidates the old link and issues a new one. 停止 revokes
   mobile access: paired devices 403 on their next request, including their
   live stream.

### Behavior notes

- Installing this plugin gates non-loopback `/api` access behind pairing
  (see `requirePairingForLan` in `src/index.ts`). A desktop browser opened
  via the LAN URL must pair like any remote device; loopback (127.0.0.1)
  is unaffected. Set `requirePairingForLan: false` in the profile patch to
  restore the open-LAN behavior while keeping tokens/status/revocation.
- The QR link is built from the machine's non-internal IPv4 literals; a
  multi-homed host (Wi-Fi + wired, or a proxy/VPN virtual adapter) shows a
  radio picker so you can advertise the network the phone can actually
  reach. The first literal is the default.

## Development

Keep this repository and the DeepSeek Harness checkout as siblings:

```text
~/code/test-zhu1090093659   # the DSH checkout (peer API source)
~/code/dsh-web-ui/packages/remote-web-ui
```

```sh
pnpm install
pnpm run build
pnpm run test
pnpm run typecheck
```

The peer APIs come from the sibling checkout: the standalone TypeScript and
Vitest configurations resolve those sources through `../test-zhu1090093659`
(turtle-ui's layout convention, different directory name). The consumer-side
`prepare` build (`tsdown.prepare.config.ts`) transpiles without type
checking, so git installs work without a sibling checkout.

## Checks

```sh
pnpm run typecheck
pnpm test
pnpm run build
```

## Harness contract dependencies

This plugin rides three harness seams that may not exist in older checkouts:

- **`api/gate` waterfall** (packages/client/connection): the /api route and
  event WebSocket upgrades emit this event after the trust fence so plugins
  can enforce application-level access control. Without it, revocation has
  no server-side teeth.
- **`sidebar.remote` foot seat** (packages/client/ui-sidebar): the sidebar
  declares and renders the seat the phone entry occupies.
- **LAN runtime connection fixes** (host-apiproxy `mintRpcId` fallback for
  insecure-context origins; the 20260808-branch connection loop opening the
  host stream after the mux stream): without them the browser runtime cannot
  run on a plain-HTTP LAN page at all (the mobile side of this feature).

The fence helpers (`isTrustedApiRequest` / `isLoopbackHostname`) are
reimplemented locally in `src/gate.ts` / `src/routes.ts`: the 20260810
upstream moved the trust fence inside the connection plugin and stopped
exporting them, so the pairing routes carry their own copy scoped to the
literals the QR links advertise.
See the Agent Notes `api-gate-and-sidebar-remote-seat` and
`lan-runtime-connection-fixes` in the harness checkout.

## Manual E2E: LAN pairing round trip

The unit/component specs cover the route family, the gate, and the panel,
but the pairing loop involves a real browser on a non-loopback origin.
Repeat this after any change to the wire contract or the connection loop:

1. Start the server on all interfaces with a test workspace root:
   `dsh web --host 0.0.0.0 --port 3190 --workspace-root /tmp/remote-e2e`.
2. Open the **loopback** URL (`http://127.0.0.1:3190`) in a browser: the
   phone icon sits in the sidebar foot; the panel mints a QR instantly.
3. In a second tab (or a phone) open the **LAN** URL with the pair token
   (e.g. `http://192.168.1.7:3190/?pair=<token>`): the page accepts, sets
   the HttpOnly `dsh_pair` cookie, reloads, and boots the full UI — no
   console errors, and a generation round trip completes.
4. The desktop badge flips to 已连接 in real time; a LAN-origin desktop
   page instead shows the 配对面板仅限本机使用 banner and opens no status
   stream.
5. 停止 on the desktop cuts the phone off: its next `/api` request 403s
   (reconnect loops retry until a fresh QR re-pairs).

## Known Limitations and Deferred Work

- **Revocation is per-request**: a paired phone whose request is already in
  flight when 停止 lands completes that request; the next one 403s.
- **Device sessions are in-memory**: pairing state (token + devices) resets
  with the `dsh web` process.
- **No per-device management UI**: the panel shows aggregate status
  (waiting / connected N / offline); individual device revocation is
  deferred.
- **Dev HMR**: `dsh web --dev` polls every roster bundle by path, so
  rebuilding this package (its own `tsdown --watch`) hot-reloads the client
  bundle; no harness-side watcher is involved.

## Dependency rationale

`qrcode.react` (MIT, actively maintained, React 16–19 support) renders the
QR as a dependency-free SVG component — no canvas, no server-side image
generation. It is inlined into the client bundle at build time (like the
official skin/turtle-ui plugins inline their non-shared deps), so profile
installations need no extra runtime dependency beyond the dsh peer closure.
`schemastery` is the DSH-standard config schema validator.
