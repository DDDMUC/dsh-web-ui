# Agent Note: dsh-pet asset routes stop recomputing per-request constants

Status: implemented

## Problem

Every request through the pet file routes paid two avoidable costs. First, `containedRealpath` ran `realpathSync` on the containment base for every request, although the base — a registry entry directory or a runtime root — is fixed for the handler lifetime (routes are built once over an immutable registry snapshot). Second, the asset handler matched the requested path with `entry.servable.includes(rel)`, a linear scan over a list that for a full live2d model closure routinely exceeds a hundred files, each fetched through this handler per mount.

## Decision

`packages/dsh-pet/src/routes.ts` resolves each containment base once into a module-level `REAL_BASE_CACHE` (registry-bounded; only successes cached, candidate still realpath'ed live on every call) and builds one `Set` of servable paths per entry at `assetHandler` construction, turning the per-request match into a Set probe. The security semantics are unchanged — a symlinked base re-pointed mid-process now fails containment until restart, which is the deny-safe direction, and the candidate-side symlink escape check is exactly as before. The decoration handler keeps its two-entry `includes` (a Set there would not pay for itself).

## Alternatives considered

- **Eagerly realpathing every entry at handler construction**: rejected — pre-warming the cache for pets never requested adds startup syscalls for no per-request gain over lazy fill; the lazy map reaches the same steady state.
- **Caching the candidate realpath too**: rejected outright — the candidate must stay live for the escape check to see newly swapped symlinks; caching it would weaken the security boundary for microsecond gains.
- **Converting `servable` itself to a `Set` in the registry**: rejected — `PetEntry.servable` is package surface consumed elsewhere as an array (`petEntryView` stripping, tests); reshaping the public shape is a bigger change than a handler-local Set.

## Consequences

- Per request, the file routes save one `realpathSync` syscall; the live2d asset path replaces an O(closure) scan with an O(1) probe.
- One module-level map holds one realpath per pet directory and runtime root for the process lifetime.

## Testing

- Measured (3 runs): containment over 20,000 calls took 450-922 ms uncached versus 250-304 ms with the cached base (about 1.8-3x; the live candidate resolution remains by design). The servable probe over a 150-entry list took 71-96 ms per 100,000 `includes` versus 0.2-0.7 ms per 100,000 `Set.has` (about 150-400x).
- `tests/routes.spec.ts`, `tests/asset-security.spec.ts`, and `tests/access.spec.ts` pass unchanged in their traversal, symlink-escape, cap, and fencing assertions (36 tests), pinning that the security behavior did not move.
