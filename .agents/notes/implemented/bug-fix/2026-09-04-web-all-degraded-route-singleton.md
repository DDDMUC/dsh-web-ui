# Agent Note: dsh-web-all degraded health route singleton registration

Status: implemented

## Problem

Under `@linxin666/dsh-web-all@0.3.13`, starting `dsh web` failed during plugin tree loading with the following error:
```
Error: failed to apply loader entry web-ui-plugin-manager (@linxin666/dsh-web-all/plugin-manager): webserver: duplicate exact route "/api/dsh-web-all/degraded"
```
Every family subpath row (17 child plugins in total) mounts through the fault-isolation shell module (`packages/dsh-web-all/src/shell.ts`). Each shell entry invocation of `apply()` unconditionally registered the exact route `/api/dsh-web-all/degraded` on the host's `webServer` service. On mounting the second child plugin, the host WebServer rejected the duplicate exact route, aborting the plugin tree (issue #1363).

## Decision

1. In `packages/dsh-web-all/src/shell.ts`, introduce reference counting (`degradedRouteRefCount`) and singleton state (`unregisterDegradedRoute`) for the `/api/dsh-web-all/degraded` route.
2. The route is registered on the host `webServer` exactly once when the first shell entry activates. Subsequent sibling shell entries increment the reference counter without re-registering.
3. Wrap `webServer.register()` in defensive error handling so unexpected route collisions never abort the fault-isolation shell mount.
4. Each entry's `ctx.effect()` teardown decrements the counter; only when the counter reaches zero (all shell entries disposed) is the route unregistered.
5. Rebuild `packages/dsh-web-all` artifacts.

## Testing

- Added unit test in `packages/dsh-web-all/tests/shell-isolation.spec.ts` simulating 17 sequential family subpath rows mounting and verifying that `webServer.register` is invoked exactly once, no duplicate route error is thrown, the route stays alive while at least one entry is active, and it is cleanly disposed when all 17 entries tear down.
- Ran `pnpm --filter @linxin666/dsh-web-all test` (4 test files, 18 passed, 7 skipped).
- Ran `pnpm aggregate:check`.

## Alternatives considered

- Giving each child plugin its own unique subpath route (e.g. `/api/dsh-web-all/<subpath>/degraded`). Rejected: the degraded route reports the shared global degradation ledger across the entire family; a single well-known endpoint is simpler and conforms to monitoring contracts.
- Removing the degraded HTTP endpoint entirely. Rejected: doctor and external monitoring tools rely on this loopback route for black-box health visibility without log scraping.

## Consequences

- All 17 family subpath rows mount cleanly behind the fault-isolation shell without triggering route collisions.
- The shared health endpoint remains available throughout the active lifecycle of the aggregate package.
