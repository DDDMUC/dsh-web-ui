# Agent Note: remote-web-ui loopback HTTP proxy tears both legs down

Status: implemented

## Problem

`pipeLoopbackHttp` proxied the phone's gated HTTP traffic to 127.0.0.1 with only one direction of failure wiring (`upstream.on('error')`), unlike its WebSocket twin `proxyLoopbackUpgrade`, which tears both legs down on error and close. Two connection-stability gaps followed, both reproduced against real servers in `tests/loopback-proxy.spec.ts`:

1. **Outer abort did not stop the inner request.** When the phone dropped mid-request (weak mobile network, tab closed), `req.pipe(upstream)` detached without destroying the upstream call: the loopback server kept receiving a truncated body and processing it, and kept a connection open — in the reproduction, `server.close()` could not even complete because the orphaned inner request never finished.
2. **An inner reset left the outer request hanging.** When the loopback upstream died mid-response, nothing destroyed the outer leg: the phone's request hung indefinitely (reproduction: the client saw no end until its own 5 s timeout). Depending on Node version and timing, the truncated upstream response can also raise an `'error'` with no listener on the response stream — an unhandled-error path.

## Decision

`pipeLoopbackHttp` now wires the same two-leg teardown discipline as the upgrade path:

- `upstreamRes.on('error')` destroys the outer response, so an inner mid-stream reset ends the phone's request promptly.
- `res.on('close')` destroys the upstream call when the outer leg closes before the upstream response finished — guarded by `!upstreamRes.readableEnded`, so a normal completion never destroys a keep-alive socket the global agent would reuse.
- `req.on('error')` destroys the upstream call when the outer request aborts mid-body, so the loopback server stops working on a call nobody will read.

## Testing

- `tests/loopback-proxy.spec.ts` (new, real HTTP servers on loopback): outer abort mid-body leaves the inner request aborted (and both servers close cleanly); inner mid-stream reset delivers headers plus the partial body and ends the outer request as premature; five sequential proxied requests open exactly one upstream connection.
- Discrimination check: with the pre-patch `loopback-proxy.ts`, the abort and reset tests fail (orphaned inner request blocks `server.close()`; the outer client hangs to its timeout); with the patch, all three pass in ~150 ms. The keep-alive test passes on both versions, pinning that the teardown guard does not regress connection reuse.

## Alternatives considered

- Replacing `pipe` with manual stream piping and `pipeline()`: rejected — `stream.pipeline`'s auto-teardown would also destroy the upstream on normal outer completion unless separately guarded, regressing keep-alive reuse; the three targeted hooks express exactly the intended policy.
- Timeouts on the upstream request instead of teardown wiring: rejected — a timeout only bounds a hang after the fact; it neither stops wasted inner work on outer abort nor distinguishes slow-but-alive inner responses, and picking a duration is policy the runtime should not guess.

## Consequences

A phone disconnect or an inner-server reset now costs one promptly-reset connection pair instead of an orphaned inner request or a hung mobile request. Sequential gated HTTP traffic keeps riding a single reused loopback connection.
