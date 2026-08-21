# @linxin666/dsh-doctor

English | [中文](README.zh.md)

Transactional rescue mode for DeepSeek Harness profiles: a user-level Doctor
Supervisor plus a transparent Doctor Launcher keep an isolated rescue capsule
ready, detect boot failures, process crashes, heartbeat timeouts, Web failures
and browser white screens, and restore the profile through snapshots,
deterministic repairs, isolated health gates and atomic promote or rollback.
The package ships disabled by default and is enabled from its Doctor card in
Settings → Plugin configuration → Web UI plugins. It does not modify a DSH
installation.

## What it does

- The Doctor Host Plugin runs inside every protected DSH host: it exposes the
  loopback recovery API, reports heartbeat and launch-phase facts to the
  Supervisor, and collects browser failure reports.
- The Doctor Web Console (the family plugin card inside Settings → Plugin
  configuration → Web UI plugins) shows the system phase, protected profiles,
  incidents and the client failure probe, and offers diagnose, repair, rollback,
  pause, resume and uninstall actions alongside the enable switch.
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

Restart `dsh web`, open Settings → Plugin configuration → Web UI plugins, expand
the Doctor card, and enable it. The package
also ships the `dsh-doctor` CLI for the Supervisor, the Launcher, provisioning
and the user-level service adapters.

## Enable

The enable flow is one transaction with rollback on failure: check the
toolchain, locate the real `dsh` executable, provision the rescue capsule,
verify the isolated recovery Web, install the per-user Supervisor service,
register the launcher, register the current profile, take the first
known-good snapshot, and finally switch the system to armed. A rescue profile
is never a rescue target.

## CLI

The `dsh-doctor` binary exposes the operational commands:

| Command | Meaning |
| --- | --- |
| `dsh-doctor supervisor` | run the Supervisor in the foreground |
| `dsh-doctor launch [dsh args...]` | relay one `dsh` invocation under supervision |
| `dsh-doctor status` | print the Supervisor snapshot as JSON |
| `dsh-doctor provision` | provision or refresh the rescue capsule |
| `dsh-doctor snapshot [profile]` | capture one profile snapshot |
| `dsh-doctor diagnose [profile]` | diagnose and plan one profile without writing |
| `dsh-doctor repair [profile] --allow-live` | run the staged repair transaction (gated promote) |
| `dsh-doctor rollback <txnId>` | restore a promoted transaction from quarantine |
| `dsh-doctor service-plan` | print the platform service files and commands |
| `dsh-doctor service-install` | write the service files and register the service |
| `dsh-doctor service-uninstall` | deregister and remove the service files |

Exit codes: 0 ok, 1 repaired and verified, 2 attention needed, 3 blocked
(lock, offline or missing secret).

## Config

The host settings namespace is `doctor`:

| Key | Default | Meaning |
| --- | --- | --- |
| `enabled` | `false` | master switch; routes mount only when enabled |
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
- Writes are confined to `DSH_DOCTOR_HOME` and the package-owned files;
  profile mutations happen only through the official `dsh plugin` command.

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
