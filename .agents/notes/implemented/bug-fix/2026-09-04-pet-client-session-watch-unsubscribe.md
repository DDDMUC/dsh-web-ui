# Agent Note: dsh-pet client unsubscribes the session watch on UI teardown

Status: implemented

## Problem

The browser half keeps one `sessions.list` subscription (the 'pet: current-session watch' effect) so a current-session switch re-orders the bubble stack without waiting for the 2 s poll. `disposeUi` — the teardown shared by the settings-toggle path, `killUi`, and bundle takeover — stopped the poll interval and unmounted the React root, but never unsubscribed that watch. After a user disabled the pet in settings, every later session-store notification kept invoking `pollNow()` for the page lifetime: a `/api/pet/state` fetch (plus `/api/pet/pets` retries) publishing into a store whose React tree was already gone. Only a full plugin fiber disposal released the subscription.

## Decision

`disposeUi` in `packages/dsh-pet/src/client/index.ts` now calls `disposeSessionWatch()` alongside `disposePoll()`. The watch follows the UI lifetime: settings toggle-off, terminal teardown (the issue #785 takeover), and fiber disposal all leave zero live sessions listeners, and re-enabling the pet mounts a fresh watch with the fresh UI.

## Alternatives considered

- **Narrow the subscription to current-session changes only**: rejected as the primary fix — the sessions store face used here offers no selector API, and wasted-RPC frequency on list notifications is a separate question from the leak; throttling that path would change refresh semantics without measured frequency evidence.
- **Subscribe inside the poll effect ('pet: poll')**: rejected because the watch and the poll have different intents (immediate bubble re-order vs 2 s cadence), and merging them couples two effects that the lifecycle tests reason about separately.

## Consequences

- Disabling the pet stops all pet-driven network activity; no sessions listener survives the unmounted store.
- The effect cleanup stays registered at fiber level, so the manual unsubscribe and the fiber-level one remain idempotent (set-membership delete), matching the existing 'pet: poll' discipline.

## Testing

- `packages/dsh-pet/src/client/index.test.tsx`: the fake context now counts live `sessions.list` listeners; the new test pins unsubscribe on settings toggle-off and a fresh subscription on re-enable (6 tests in the file pass).
