# Agent Note: remote-web-ui trust and resource fixes

Status: implemented

## Problem

A read-only audit of `packages/dsh-remote-web-ui` (host trust/credential surface, host runtime, browser half, client/server contract) plus a measurement run against the shipped handlers found defects with concrete cost:

1. With `requirePairingForLan: false`, the `/remote` prefix proxied every request to loopback while attaching the process's own `dsh-auth-*` credential — the credential that authorizes as the machine owner. Any client that could reach the port (LAN bind, quick tunnel, relay) drove the full host API without pairing, while the config text promised only that the desktop stays on plain `/api`.
2. The accept rate limiter keyed loopback-peered requests on the FIRST `X-Forwarded-For` hop — a value the client controls, because an edge appends rather than replaces it — so a rotating header minted a fresh brute-force budget per request. The table also had no hard cap, so the same rotation grew it without bound. Measured on the shipped handler with rotating keys: average per-request latency 0.067 ms over the first 2 000 requests versus 0.152 ms over the last 2 000 of 30 000 (2.3x, monotonic); RSS +41..44 MB.
3. The portrait adaptation layer tracked every session/project row it suppressed in a `Map` that was cleared only on revert. React recreates rows, so detached subtrees stayed reachable for the page lifetime; a WeakRef probe with forced GC confirmed the retention.
4. Smaller confirmed gaps: the panel removed a device row (and flipped 停止 to the stopped phase) optimistically while a refused `revoke`/`stop` left the session live server-side, and the service emits no state change for a request that changed nothing, so the false assurance could persist; a write-only `localStorage` copy of the device credential (nothing reads it, no expiry); a trailing slash in `publicBaseUrl` minting a dead `//pair-accept` link; the `/pair-app` shell fetch never invalidating a stale inner credential (every pairing 502s until a restart); the heartbeat polling a permanent 401/403 forever; `taskkill` spawned without an `error` listener on the win32 update-timeout path; the browser loopback predicate missing the bracketed `[::1]` spelling the host side accepts; `isTrustedHost` throwing on a malformed trusted-host entry; and documentation that contradicted the implemented semantics (a "one-time" token that is deliberately re-usable within its window, a 7-day idle default that is 30 days).

## Decision

- **The process's inner browser-auth credential rides only a request that presented a live paired-device credential.** Both the HTTP and the WebSocket `/remote` handlers resolve the device credential first and pass `deps.auth` only when it is live. With `requirePairingForLan` off the channel still proxies a stale same-origin rewrite (no 403), but an unpaired caller is forwarded without the credential and the inner route answers 401. The config JSDoc and both README security models state this.
- **The accept limiter trusts only the edge-appended XFF hop and is hard-capped.** `rateLimitAccept` takes the LAST hop of the header (an edge appends the address it saw; earlier hops are caller-supplied) and `acceptLimitKey` truncates it to 64 characters. The bucket table is bounded by `MAX_ACCEPT_BUCKETS` (1024) with FIFO eviction, and expiry is amortized: buckets are pruned from the front of the insertion-ordered table, which is O(1) per request because a re-armed bucket is re-inserted at the tail.
- **The adaptation layer forgets rows React has detached.** `disableRowDrag` restores the recorded `draggable` state onto any tracked row that is no longer connected and drops the entry, so the table only ever holds live rows. `restoreRowDragState` is shared with the revert path.
- **The public base is canonicalized to its origin** where it enters the service (`PairingService.setPublicBaseUrl` via `canonicalBaseUrl`), so a trailing slash or path cannot mint an unroutable `//pair-accept` link.
- **The device credential is session-scoped.** The `/pair-app` capture script writes it to `sessionStorage` only; the never-read `localStorage` copy is gone.
- **A refused revoke or stop leaves the panel roster alone.** `RemoteEntry` applies the optimistic phase/roster flip only after the request resolves, so a 403/network failure keeps the server-authoritative row instead of claiming a revocation that did not happen.
- **Polling stops when the server proves it can never accept the page.** `sendHeartbeat` returns the response status and `shouldStopHeartbeat` (401/403) clears the 10 s interval; a transient error keeps the cadence.
- **Smaller correctness fixes**: the shell fetch invalidates a stale inner credential on 401/403; the win32 `taskkill` child gets an `error` listener; the browser loopback predicate (and the boot-script guard) accepts `[::1]`; `isTrustedHost` ignores an unparsable trusted-host entry instead of throwing; the write-only `consumed` token flag is removed and the contradictory `accept()` doc states the bearer-until-expiry semantics; the idle-default doc says 30 days.

## Alternatives considered

- **Restore true single-use tokens** (make `accept()` return the existing `used` code and 409). Rejected: re-usability within the window is a deliberate accommodation for mobile flows that split across cookie contexts (camera preview to in-app browser to system browser), and the tests pin it. The false claim was in the copy and the code comment, so those were corrected instead; `used` stays in the wire contract as the branch an older or third-party host may still answer.
- **Keep keying the limiter on the first XFF hop** and rely on token entropy. Rejected: the limiter is the only bound on unauthenticated flooding of the pairing endpoints, and a caller-controlled key makes it a no-op while still costing memory.
- **Require pairing on `/remote` even with the policy off** (403 instead of 401). Rejected: the documented purpose of the policy-off mode is that a stale same-origin rewrite keeps working, and a 403 would break it outright; withholding the credential preserves the documented behavior while removing the machine-owner access.
- **Cache the app frame and root the adaptation tick's queries at it** (5 of 7 document-wide scans per 600 ms tick). Not implemented in this pass: the saving is real but the selector-semantics change needs a browser QA round on the live GUI, and the tick already converges on the collapse observer. Recorded for a follow-up.
- **Delete the `used` wire code end to end.** Rejected for now: the client mapping and its locale copy are the graceful path for a host that does answer 409; removing them would be a wire-contract change without a corresponding failure to fix.

## Consequences

- An operator who turns the pairing policy off no longer gets a silent machine-owner bypass, but a stale client rewrite on such a deployment now sees the harness's 401 instead of a working proxy. That is the documented "plain `/api`" model and is stated in the security model.
- The limiter can evict a legitimate bucket under a sustained rotating-key flood, resetting that client's window. Token guessing remains infeasible regardless (128-bit tokens); the cap buys bounded memory and flat per-request cost.
- A detached row keeps its official `draggable` state until the next 600 ms tick rather than until revert; the tick already runs while the layer is active.
- The heartbeat no longer refreshes presence after a revocation, so a revoked phone stops being counted online immediately instead of every 10 s.

## Testing

- `tests/remote-api.spec.ts`: the process credential is absent (and never redeemed) for an unpaired request with the policy off, and still attached for a live paired device.
- `tests/routes.spec.ts`: the last XFF hop buckets a rotating prepended hop into one rate-limit window; a trailing-slash public base issues a routable QR URL; a malformed trusted-host entry is ignored.
- `tests/pair-api.spec.ts`: the heartbeat status is surfaced and the stop decision is 401/403 only.
- `tests/remote-entry.spec.tsx`: a refused unpair keeps the device row (the test fails on the pre-fix optimistic mutation).
- `tests/mobile-adapt.spec.ts`: a detached row is no longer tracked; the spec clears the intervals a fresh module instance starts, so stale layers cannot interfere across tests.
- Measurement (same script, 30 000 rotating keys, three runs per version): baseline 0.067 ms to 0.152 ms per request with RSS +41..44 MB; fixed 0.059 ms to 0.041 ms with no growth trend. The RSS delta stays churn-dominated and is not evidence on its own; the table bound is by construction.
