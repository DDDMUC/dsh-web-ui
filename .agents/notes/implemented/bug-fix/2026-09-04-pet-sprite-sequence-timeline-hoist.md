# Agent Note: dsh-pet sprite sequence animation hoists its per-frame tables

Status: implemented

## Problem

Inside the sprite frame loop, the sequence branch (manifest-defined `done`/`failed` scene sequences) recomputed its timing state on every rAF tick (~60 Hz): `sequenceFrameAt` allocated a fresh per-item durations array plus two reduces per call, and the branch trimmed the active track with two more array slices per tick, only to throw the results away. The single-track branch directly below had already hoisted its row/track into the effect scope, with a comment calling the per-frame recompute "pure waste"; the sequence branch simply never received the same hoisting.

## Decision

`packages/dsh-pet/src/client/sequences.ts` gains `createSequenceTimeline(sequence, tracks)`, which builds the cumulative duration table once and resolves `frameAt(elapsedMs)` from it; `sequenceFrameAt` stays as a thin wrapper over a fresh timeline, so the public helper keeps its exact semantics. `PetSprite`'s frame-loop effect now builds the timeline and a map of per-item trimmed tracks (animation -> row + trimmed track) in the effect scope, and the tick reads only precomputed tables. Frame indices still resolve against the full track durations and index into the trimmed frames — the same composition as before, so rendered frames are unchanged for any manifest.

## Alternatives considered

- **Extending `sequenceFrameAt` with an optional precomputed-table parameter**: rejected — an overloaded parameter shape is harder to read than a dedicated factory, and the wrapper keeps the existing call sites and tests untouched.
- **Memoizing inside `sequenceFrameAt` keyed by sequence identity**: rejected — module-level memo state for a pure helper is surprising; the caller already has the right scope (the effect) for the tables.
- **Hoisting only the trimmed tracks, leaving `sequenceFrameAt` per tick**: rejected — the map/reduce inside the resolver was the dominant allocation; hoisting half the waste would complicate the loop without removing most of it.

## Consequences

- Sequence phases allocate no arrays per frame; per-query resolution is roughly an order of magnitude cheaper.
- `sequenceFrameAt` remains available with identical behavior; its tests pass unchanged plus new parity tests pinning the timeline against it across animation-rate elapsed samples.

## Testing

- Measured (60,000 resolutions per arm, 3 runs): the per-call helper took 10.1-27.0 ms per run while the prebuilt timeline took 0.5-4.8 ms — a per-query speedup of about 5-20x (median about 19x), on top of removing two array slices per frame in the sprite loop.
- `src/client/sequences.test.ts`: new cases pin `createSequenceTimeline` against `sequenceFrameAt` for every 7 ms sample over 1.5 s of sequence time and determinism across repeated queries (4 tests pass).
- `src/client/PetSprite.test.tsx` and `src/client/index.test.tsx`: sprite loop behavior unchanged (56 tests pass).
