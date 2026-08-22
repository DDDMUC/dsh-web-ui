# @linxin666/dsh-doctor

English | [中文](README.zh.md)

Transactional rescue mode for DeepSeek Harness profiles: a user-level Doctor
Supervisor plus a transparent Doctor Launcher keep an isolated rescue capsule
ready, detect boot failures, process crashes, heartbeat timeouts, Web failures
and browser white screens, and restore the profile through snapshots,
deterministic repairs, isolated health gates and atomic promote or rollback.
The package ships enabled by default: fresh installs and Web UI version
updates boot with rescue mode active, while an explicit off choice in the
Doctor card is preserved. It can be toggled from its Doctor card in
Settings → Plugin configuration → Web UI plugins. It does not modify a DSH
installation.

## What it does

- The Doctor Host Plugin runs inside every protected DSH host: it exposes the
  loopback recovery API, reports heartbeat and launch-phase facts to the
  Supervisor, and collects browser failure reports.
- The Doctor Web Console (the family plugin card inside Settings → Plugin
  configuration → Web UI plugins) shows the system phase, protected profiles,
  incidents and the client failure probe, records Web UI plugins that were
  enabled but never started, and offers diagnose, repair, rollback, pause and
  resume actions alongside the enable switch plus a Service and capsule card:
  one-click install, restart-upgrade and uninstall of the user-level service.
- The Send to Harness window composes a troubleshooting prompt from the newest
  recorded failure (summary plus error stack) and queues it into the current
  DSH session as a new turn, so the user's agent can diagnose and fix it in
  place; the prompt is editable and copyable before sending. Failed-plugin rows
  also carry one-click Copy error and Disable and restart actions (disable
  writes the profile patch enabled row through the plugin-manager channel and
  takes effect after the host restart).
- The Doctor Supervisor runs as a per-user background service. It classifies
  exits into user stops, task completion and real failures, applies the
  crash-loop circuit breaker, and owns rescue scheduling.
- The Doctor Launcher relays `dsh` arguments verbatim to the real DSH
  executable, forwards stdin, stdout, stderr and signals, records startup
  intent and exit facts, and only then reports an incident.
- The Rescue Capsule provisions a pinned DSH runtime, a pinned Doctor package
  and an isolated `DSH_HOME` at a machine-local home, so a broken user overlay
  or profile patch can never block the recovery console.

Profile package.json and cordis.patch.yml are only touched through the official
`dsh plugin` command and the documented profile-layer conventions.

## Components

| Part | Runs when | Responsibility |
| --- | --- | --- |
| Doctor Host Plugin | inside every protected host | settings surface, loopback API, heartbeat and client failure reports |
| Doctor Web Console | in the DSH Web GUI | enable flow, status, incidents, diagnose and repair actions |
| Doctor Supervisor | as a user-level service | lifecycle monitoring, classification, circuit breaker, rescue scheduling |
| Doctor Launcher | at every `dsh` invocation | transparent relay of argv, signals and exit facts |
| Rescue Capsule | machine-local isolated home | pinned runtime, isolated home, offline diagnostics and repair tooling |

## Install

### From npm (family first)

```sh
dsh plugin --profile web add @linxin666/dsh-web-ui-all@latest
```

### As a standalone bundle

```sh
dsh plugin --profile web add @linxin666/dsh-doctor@latest
```

### From the repository (development)

```sh
git clone https://github.com/zhu1090093659/dsh-web-ui.git
cd dsh-web-ui
pnpm install
pnpm -r build
dsh plugin --profile web add link:$(pwd)/packages/dsh-doctor
```

Restart `dsh web`, open Settings → Plugin configuration → Web UI plugins, and
expand the Doctor card to confirm rescue mode is on (it is by default). The package
also ships the `dsh-doctor` CLI for the Supervisor, the Launcher, provisioning
and the user-level service adapters.

## Enable

After the Doctor card switches enable rescue mode on, the host half mounts the
`/api/doctor/*` endpoints and starts reporting heartbeats. When the per-user
Doctor Supervisor service is not installed yet, the host status shows Doctor
offline and the Service and capsule card offers Install now: it regenerates and
registers the user-level service from the current package (previous
registration dropped first, then deploy and restart, idempotent), waits for
the Supervisor to answer, and refreshes the rescue capsule when it is missing
or pinned to a different Doctor version. The button shows Installing/repairing
while the verb runs; failures surface the error code and stderr.

## Update

After an update, restart `dsh web` so the host half loads the new code, then
click Restart and upgrade in the Service and capsule card (the button appears
whenever the reported Supervisor version lags): it redeploys the user-level
service and restarts the Supervisor with the new code, and refreshes the
capsule when its pinned version differs. When the user changes a provider or
its keys, the capsule credential fingerprint detects the drift and the same
button re-mirrors the new configuration. When the package install path changed
(new directory, new profile, reinstall), the previous service record points at
a stale path and one click rewrites the service definition. The CLI
`service-install` is idempotent and safe to repeat.

## CLI

The `dsh-doctor` binary exposes the operational commands:

| Command | Meaning |
| --- | --- |
| `dsh-doctor supervisor` | run the Supervisor in the foreground |
| `dsh-doctor launch [dsh args...]` | relay one `dsh` invocation under supervision |
| `dsh-doctor status` | print the Supervisor snapshot as JSON |
| `dsh-doctor provision [profile] [--no-credentials]` | provision or refresh the rescue capsule (mirrors provider config and credentials with 0600; pinned to the current package version by default; `DSH_DOCTOR_PACKAGE`, `--no-credentials` and `DSH_DOCTOR_CREDENTIALS=off` adjust it) |
| `dsh-doctor snapshot [profile]` | capture one profile snapshot |
| `dsh-doctor diagnose [profile]` | diagnose and plan one profile without writing |
| `dsh-doctor repair [profile] --allow-live` | run the staged repair transaction (gated promote) |
| `dsh-doctor rollback <txnId>` | restore a promoted transaction from quarantine |
| `dsh-doctor service-plan` | print the platform service files and commands |
| `dsh-doctor service-install` | write the service files and idempotently register the service (drop the old registration, deploy, restart) |
| `dsh-doctor service-uninstall` | deregister and remove the service files |

Exit codes: 0 ok, 1 repaired and verified, 2 attention needed, 3 blocked
(lock, offline or missing secret).

## Config

The host settings namespace is `doctor`:

| Key | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | master switch; routes mount only when enabled |
| `fullProtection` | `true` | install the Supervisor and launcher on enable |
| `autoRepair` | `true` | allow deterministic repairs to promote after verification |
| `heartbeatIntervalMs` | `5000` | host heartbeat cadence |

Environment:

| Variable | Meaning |
| --- | --- |
| `DSH_DOCTOR_HOME` | doctor root (default `~/.dsh-doctor`; overridable) |
| `DSH_DOCTOR_REAL_DSH` | absolute path of the real `dsh` executable |
| `DSH_DOCTOR_PACKAGE` | package spec used to install the rescue Doctor |
| `DSH_DOCTOR_PACKAGE_DIR` | local checkout to link during development |
| `DSH_DOCTOR_CREDENTIALS` | when `off`, credential files are not mirrored into the rescue capsule (mirrored by default) |
| `DSH_DOCTOR_ENDPOINT` | Supervisor endpoint injected by the launcher |
| `DSH_DOCTOR_TOKEN` | one-run Supervisor token injected by the launcher |
| `DSH_DOCTOR_RUN_ID` | one-run launch identity injected by the launcher |

## Health and recovery

| Failure | Detection | Default action |
| --- | --- | --- |
| boot failure | launcher exit before the ready phase, structured stderr | retry once, then open rescue |
| plugin init failure | non-zero config phase exit | retry once, then open rescue |
| runtime crash | signal or non-zero exit after startup | one restart, then circuit breaker |
| heartbeat loss | no heartbeat within the window | process and HTTP probes, then rescue |
| Web failure | repeated loopback HTTP failures | rescue on spare port when host is alive |
| browser white screen | client probe and error boundary | client-local recovery first; incident only with evidence |
| user Ctrl+C | launcher signal | normal stop, no incident |
| headless business failure | healthy app with non-zero exit | report only |

The circuit breaker suspends automatic retries after repeated failures within
the window and quarantines the profile for explicit user confirmation.

## Repair model

Every repair is a transaction: snapshot the live profile, stage a candidate
environment, apply only deterministic rule-based operations, run isolated
dump-config and Web health gates against the candidate, promote with the
original quarantined, verify in place, and roll back byte-exactly on failure.
The repair engine never guesses: ambiguous cases generate a candidate and wait
for confirmation, and no action installs an unverified `latest` or executes
untrusted shell commands. Repair and rollback journals are append-only and
recoverable across crashes.

## Security model

- Everything runs as the current user; no root or admin elevation.
- The Supervisor listens only on a local Unix socket (named pipe on Windows);
  requests carry a per-install bearer token stored with mode 0600.
- The Web API is loopback-only and never hands the browser the token.
- The launcher and Supervisor never run a shell; DSH argv is relayed verbatim.
- No secrets are written to state, logs or incident records; snapshots redact
  credentials and the redacted tier can never restore them.
- The rescue capsule binds only to loopback and never reads the profile home
  overlay except during explicit inspection.
- The rescue capsule mirrors the user profile settings and credential files
  (settings.yaml / .credentials.yaml / .env and peers, mode 0600, canonical
  names only, never backup variants); the manifest records file names and a
  content fingerprint only and never holds the secrets themselves; uninstall
  removes the mirror per the recorded list.
- Writes are confined to `DSH_DOCTOR_HOME` and the package-owned files;
  profile mutations happen only through the official `dsh plugin` command.
- One-click install, upgrade and uninstall only invoke this package's CLI with
  argument arrays (launchctl / systemd --user / schtasks) and never enable a
  shell.

## Known limitations

- A profile started by invoking the real `dsh` executable by absolute path
  bypasses the launcher; protection covers launcher-started runs, and
  bypassed hosts are reported as partially managed.
- Without a user systemd manager on Linux, the service falls back to a login
  autostart wrapper and stops at the last logout.
- Machine-level damage (an unloadable Node binary, an unwritable home, a dead
  volume) cannot be repaired automatically; the console shows CLI recovery
  instructions instead.
- Snapshots stay machine-local by default; cross-machine restore requires
  exported artifacts and a separate credentials vault.
- Windows support is best-effort for junctions, PowerShell 5.1 Unicode and
  per-user scheduled-task registration; several internals assume POSIX file
  semantics.
