# Agent Note: dsh-doctor supervisor runs as a host-bounded child

Status: implemented

Resolves the open finding recorded in [the desktop separate-host note](../bug-fix/2026-09-03-desktop-separate-host-reserved-ports.md): every dsh host boot redeployed the dsh-doctor OS service (a LaunchAgent / systemd unit / scheduled task with KeepAlive), so the registration was global state that any boot — dev run, e2e automation, packaged app — hijacked, and the daemon outlived every process cleanup. The desktop app, whose premise is full ownership of its child processes, made that model untenable.

## Problem

The supervisor was registered as a login-persistent daemon by each host boot (`service-install` wrote the platform service definition pointing at that boot's own install paths). The registration was never scoped: any `dsh web` boot anywhere on the machine rewrote it, launchd kept the process alive across app quits and process-group kills (it was launchd-owned, not ours), and a KeepAlive'd supervisor kept running with paths from a deleted install. Keeping it for the web side and disabling doctor for the desktop would have split the plugin's rescue features along an arbitrary line.

## Decision

The supervisor keeps every capability — socket IPC + token, state, sweep, self-heal, recovery workflows, rescue capsule — and changes only its runtime shape:

- The host's ensure spawns it as a bounded child of the host process (non-detached, unref'd, `--parent-pid <host pid>`). `watchParentPid` polls `kill(pid, 0)` and stops the supervisor when the spawning host disappears, so even an ungraceful host death cannot orphan it. A new IPC `shutdown` action lets ensure retire an answering-but-stale supervisor before respawning the current version without racing its socket.
- Ensure is now: idempotent legacy-registration removal (the first boot on a machine carrying an old registration deletes it — the migration is automatic), spawn when no current-version supervisor answers, capsule refresh as before. Heartbeat failures re-kick the reconciler, so a surviving host adopts the spawn.
- `service-plan` / `service-install` CLI verbs are removed; `service-uninstall` remains as the manual legacy cleanup; `agent/service.ts` only renders removal plans.
- Accepted feature tradeoff: self-healing a host that cannot boot at all required a login-persistent watcher. Without the daemon, healing happens while any host runs, and `dsh-doctor diagnose / repair` remains the manual path for the unbootable case.

## Alternatives considered

- Disable doctor in the desktop profile seed only: rejected — it would strip rescue features from the desktop and leave the web-side daemon untouched.
- Run the supervisor inside the host process: rejected — it merges crash domains and still needs the socket for the CLI and console interop.
- Keep the OS service but scope it to the desktop: rejected — the daemon model itself was the defect; per-host children keep the same process semantics on every platform (no root/admin, no login persistence).

## Consequences

No global service definitions are written anymore, so no boot can hijack another's registration and nothing doctor spawns survives its host. Concurrent hosts (CLI instance plus desktop instance) share one supervisor over the socket; when its spawning host exits, the next heartbeat failure makes another host adopt the spawn. Existing machines migrate automatically on the first boot of the new code.

## Testing

393 package tests pass: `agent-service` rewritten around the removal plans (all three platforms, tolerance for missing registrations and failing unregister commands), `host-ensure` rewritten around spawn/shutdown/legacy steps (current-version skip, stale-version replacement, SUPERVISOR_UNAVAILABLE, PROVISION_FAILED, coalescing), supervisor specs cover the shutdown action and the parent watch. Live: a supervisor started with an already-dead `--parent-pid` exits immediately; one with a live parent answers `status` and exits within one poll interval of the parent's death.
