# Agent Note: dsh-pet store skips the poll publish when the snapshot is unchanged

Status: implemented

## Problem

`pollNow` published every `/api/pet/state` response into the pet store unconditionally, every 2 seconds, and each publish wrote a fresh snapshot object into the state. Downstream, every store notification drove the useSyncExternalStore bridge, so an idle pet (identical phase, bubbles, affinity, display — the common steady state) still re-rendered the whole sprite portal — sprite box, bubble stack, hover panel, HUD slot — at 0.5 Hz for as long as the tab stayed visible.

## Decision

`setSnapshot` in `packages/dsh-pet/src/client/pet-store.ts` now returns without writing when the store is already `ready`, error-free, and the incoming snapshot is content-equal to the current one. The engine stack makes this skip exact: with zero immer modifications, `produce` returns the same state object, and zustand's vanilla `setState` does not notify when the next state is identical — so no subscriber fires and React re-reads the same snapshot and bails out. Equality is a JSON string compare, chosen over field enumeration because an exact match is the only way to skip: a missed field costs the one render the optimization saves, never a stale pet. Transitions that matter still publish — first snapshot, error-to-ready recovery, and any content change.

## Alternatives considered

- **Field-by-field structural equality**: rejected — an enumerator that misses a future `PetStateView` field would freeze that field's UI; JSON compare is complete by construction and the payload is small (compare runs at 0.5 Hz).
- **Skipping at the poll site in `client/index.ts`**: rejected — the store is the write boundary every publisher shares (poll, interactions, visibility recovery); guarding there covers all of them and keeps the apply body simple.
- **Debouncing notifications in the store engine**: rejected — that is shared engine surface (`dsh-client-store`) consumed by every plugin, and batching would delay real updates instead of eliminating no-op ones.

## Consequences

- An idle pet costs one JSON stringify and zero React work per poll tick; any real change publishes exactly as before.
- The skip is invisible by construction: it can only forgo a render of identical state, never a render of new state.

## Testing

- Measured through the real engine (zustand + immer, no mocks): subscriber notification counts in `src/client/pet-store.test.ts` pin that three consecutive identical snapshots notify exactly once, an error state republishes on recovery with an equal payload, and gameplay/feedback patches land on top of a skipped poll (3 tests).
- `src/client/index.test.tsx` still passes with the store actions exercised through the apply body (6 tests).
