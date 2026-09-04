# Agent Note: remote-web-ui connection-path dedup and dead-guard removal

Status: implemented

## Problem

Three small duplications/dead spots had accumulated on or beside the plugin's connection path, each one a place where a future edit could fix one copy and miss the others:

1. `src/index.ts` repeated the identical host-resolve shim (`specifier => { try { return requireFromHost.resolve(specifier) } catch { return undefined } }`) three times — for the anchor-path resolver and both update check/run seams.
2. `src/routes.ts` parsed the request Host and evaluated the private-LAN fallback (`isPrivateOrLocalHostname` + `isNonCrossSite`) in three places (`lanFence`'s cookie fallback, `handleAccept`, `handleAcceptPage`), with slightly different shapes (`typeof` guard placement, empty-hostname handling) around the same semantics.
3. `src/client/mobile-adapt.ts` guarded the composer `pointerdown` listener with a `lastComposerTapRegistered` flag that is provably dead: the whole layer installs once (`__dshRemoteAdaptInstalled`), so the flag is always `false` at that point and only obscures the listener registration.

## Decision

One `hostResolve` constant replaces the three shims; a module-level `privateLanHostOf(request)` returns the request's Host when it names a private/local hostname with non-cross-site markers (else `undefined`), and all three call sites use it — `lanFence` keeps its lazy evaluation (the helper runs only after the trusted-host branch misses); the dead flag is removed and the listener registers unconditionally. No behavior change: every removed copy was semantically identical, and the flag always evaluated to its initial value.

## Alternatives considered

- Unifying `privateLanHostOf` with `isTrustedApiRequest`'s Host parsing: rejected — the trusted fence matches configured/advertised authorities and must not encode the private-LAN notion; merging the two would entangle two distinct trust decisions.
- Leaving the three shims in place with a comment: rejected — the duplication sits inside the update seam where a future seam change (extra resolve option) would have to be applied three times in one file.

## Consequences

The private-LAN fallback has one definition the docker/reverse-proxy tests already pin; the update seams share one resolver; the mobile listener registration reads as the plain statement it is. Package behavior is unchanged (343 tests pass, including the proxy lifecycle, docker pairing, and route-family suites).
