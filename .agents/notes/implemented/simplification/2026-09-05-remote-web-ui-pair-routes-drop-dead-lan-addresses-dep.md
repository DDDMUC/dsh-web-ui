# Agent Note: remote-web-ui pair routes drop the dead lanAddresses dep

Status: implemented

## Problem

`PairRoutesDeps.lanAddresses` — a required field of the exported `makeRoutes` dependency interface, documented as "the LAN IP literals the fence accepts" — was never read by the implementation. The destructure bound it and nothing referenced it: the phone-facing fence reads `service.lanAddresses` live per request (so a hot rebind updates the fence), and the issue/status responses also read the service directly. Every call site — the plugin entry and about thirty `makeRoutes(...)` test invocations — therefore passed a value that silently did nothing, while the doc comment claimed it drove the fence. A future contributor wiring the fence to the dep (or "fixing" the fence by populating it) would change behavior under the impression of following the documented contract.

## Decision

The dep is removed: the field and its doc line are gone from `PairRoutesDeps`, the destructure no longer binds it, the plugin entry no longer passes it, and the test call sites drop the argument. The fence keeps reading `service.lanAddresses` per request, which is the behavior every test already pinned (the suites set the service's LAN bases via `setLanBases`, not the dep). No observable behavior changes: the value was never read.

## Alternatives considered

- Keeping the dep and re-pointing the fence at it: rejected — it would freeze the fence to a construction-time snapshot and break the hot-rebind behavior (a lan-bind toggle updating LAN bases mid-process) the per-request `service.lanAddresses` read exists for.
- Making the field optional with a deprecation note instead of removing it: rejected — the package is the only consumer of its own test seam, every call site is in-tree, and an optional dead field would preserve exactly the trap this change removes.

## Consequences

`makeRoutes` callers now pass only inputs the implementation reads. The fence's single source of truth for LAN literals is the live pairing service, and the interface no longer advertises a knob that does not exist.
