# Agent Note: dsh-pet asset and runtime routes revalidate with an ETag

Status: implemented

## Problem

The '/pet/<id>/*' asset route and the '/api/pet/runtime/*' route answered every request with `'cache-control': 'no-cache'` and no validator. `no-cache` permits reuse only after successful revalidation, but with no `ETag`/`Last-Modified` to revalidate against, browsers re-downloaded the full body on every page load and renderer remount. These are the largest payloads the plugin serves: sprite atlases up to the 20 MB image cap, per-frame images for frames2d pets, and the Cubism Core plus vendor bundle for every live2d pet page load. The decoration route had already solved the same problem with a weak ETag and a 304 path, with a comment stating exactly this rationale; the two bigger routes never received the same treatment.

## Decision

`packages/dsh-pet/src/routes.ts` computes a weak ETag (size + mtime, from the `stat` the size-cap check already performs) in `assetHandler` and `runtimeHandler`, answers matching `If-None-Match` requests with 304, and stamps the 200 response with the validator. The etag computation and the 304 handshake now live in shared `weakEtag`/`revalidated` helpers used by all three file routes, so the decoration handler's logic is unchanged but no longer duplicated.

Wire behavior per file is otherwise identical: same bytes, same content type, same size ceilings, same `no-cache` policy (stale copies are never used without revalidation, so an updated atlas on disk is picked up immediately once its mtime/size change).

## Alternatives considered

- **`max-age` + `immutable` with content-hash URLs**: rejected — asset URLs contain no content hash, so a replaced pet file would serve stale copies for the TTL; `no-cache` + validator keeps freshness exact with one cheap revalidation per reuse.
- **`Last-Modified` instead of `ETag`**: rejected — second-granularity mtime can miss fast successive writes; size+mtime matches the existing decoration validator and costs nothing extra.
- **ETag for the synthesized pet.json branch**: deferred — that body is computed in memory per process and is small; the win did not justify widening this change.

## Consequences

- Repeat page loads and renderer remounts settle atlas/frame/runtime fetches as 304 with an empty body instead of re-downloading up to tens of megabytes.
- The per-request server cost grows by one string format; the `stat` call was already there for the size ceiling.

## Testing

- Measured (loopback, 20 remounts of a 5 MB atlas, 3 runs, medians): pre-change world (no validator, every request re-downloads) transferred 100.0 MB per run (65-90 ms); with ETag revalidation the same 20 remounts transferred 0 KB of body (3-4 ms). On a WAN the byte saving is the dominant effect.
- `tests/routes.spec.ts` pins the contract: atlas 200 + `etag` header, `If-None-Match` replay answers 304 with an empty body, a bogus validator re-serves 200, and the same handshake for both runtime files through the `runtimeDir`/`vendorDir` test seams (24 tests in the file pass).
