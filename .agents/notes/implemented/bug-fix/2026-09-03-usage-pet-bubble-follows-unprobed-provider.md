# Agent Note: Pet bubble follows the session provider even when it has no probe facts

Status: implemented

## Problem

The dsh-usage pet bubble announced only when the session's provider resolved to a probed snapshot: `announceCurrent()` looked up `snapshots.get(provider)`, fell back to the provider's adapter family, and returned silently when neither existed. Deployments whose sessions run on providers outside the adapter catalog — relay stations, local runtimes, token-plan vendors — never saw the bubble at all: the linkage the feature promises ("follows the current session provider") existed in code but was unreachable for exactly the provider those sessions actually use. Verified live on 2026-09-03: the session route was `jiyuan` (tokenrhythm.studio), the overview reported `current` as `{ provider: 'jiyuan', source: 'live' }`, and `/api/pet/state` carried `announcement: null` across every poll.

Adding an adapter was not possible for that deployment: tokenrhythm.studio exposes no balance or plan endpoint — the OpenAI billing pair `/v1/dashboard/billing/subscription` and `/v1/dashboard/billing/usage` both answer 404, as do `/api/usage/token`, `/api/quota`, and the un-prefixed variants (probed with the stored credential during the diagnosis).

## Decision

When the current provider has no announceable probe fact, `announceCurrent()` falls back to the provider's today ledger usage — the one fact the ledger owns for every provider:

- `buildLedgerAnnouncement({ displayName, totals })` builds a `kind: 'cost'` payload (`今日 <tokens> tokens` with note `<calls> 次调用`, tone `ok`) and returns undefined when calls and tokens are both zero — a bubble about nothing is noise.
- `formatTokens()` renders magnitudes on the zh convention (`9805`, `9.7万`, `1.2亿`), matching the host-authored copy the service already speaks.
- The fallback covers every silent case uniformly: no adapter at all, failing probes (error slots without facts), and percent-less plan windows the pet validator rejects. Probeable providers with facts keep the existing cost/balance/plan bubbles; the pet announcement contract ([pet-announcement-bubble](../feature/2026-08-29-pet-announcement-bubble.md)) is unchanged — the fallback only widens which payloads the usage plugin emits.
- Display names resolve LLM runtime first, then the adapter, then the route id, so adapter-less routes still get a legible title.
- With neither fact nor usage today the bubble stays silent.

Mode semantics carry over unchanged: `always` re-announces each poll (amounts grow live), `change` compares the payload signature (usage growth re-announces), `off` skips.

## Testing

- `packages/dsh-usage/tests/usage-service.spec.ts`: the fallback announces for an adapter-less route (asserting no probe HTTP happened), for a probed snapshot with percent-less windows, stays silent with neither fact nor usage, re-announces in change mode as usage grows, and the `buildLedgerAnnouncement`/`formatTokens` contract round-trips through `parseAnnouncement`.
- The host-side effect requires a `dsh web` restart (repository rule: the agent never restarts the running service). The deployment's profile mount resolves to this workspace checkout, so the restarted host picks the fix up directly; until then the running host keeps the old bundle.

## Alternatives considered

- Adding a balance adapter for `jiyuan`/tokenrhythm.studio. Rejected: the relay implements no billing endpoint at all (verified with the stored credential), and baking a user-specific route into the generic adapter catalog cannot generalize — the same silence would return with the next relay.
- Falling back to the most recently probed provider's facts when the session provider has none. Rejected: it would present another account's balance or plan under the session provider's name — actively misleading, worse than silence.
- A muted "no data for this provider" bubble. Rejected: it would sit permanently on screen for every unsupported provider, adding noise without information; the Usage tab already carries the per-provider error and no-credential lines.
- Extending the probe interface with a two-request billing pair preemptively for relay stations. Rejected for this change: no observed relay implements the pair, and an unused interface extension is speculation; if one appears, a pair-shaped adapter can slot into the existing probe loop.

## Consequences

- Every session provider now produces a bubble as soon as it has any announceable fact — probe facts first, ledger usage second; providers with zero usage today stay silent.
- The fallback payload rides the existing pet announcement contract with TTL and mode handling untouched; no wire or persisted-format change.
- The fallback reports consumption, never a remaining quota: without a real endpoint the bubble shows usage and does not invent a balance.
