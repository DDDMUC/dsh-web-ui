# Agent Note: tv.dsh-market.com forwards through the market worker's wildcard capture

Status: implemented

## Problem

`dsh-market-telemetry-view` (the private dashboard at `tv.dsh-market.com`) stopped receiving all traffic on 2026-09-02: Cloudflare invocation analytics show daily requests through 09-02 and zero from 09-03 onward, while the exact custom domain attachment stayed `enabled` and the Cloudflare Access gate kept answering. When the relay feature attached the `*.dsh-market.com` wildcard Workers custom domain to the `dsh-market` store worker ([stable-hostname relay](../feature/2026-09-02-stable-hostname-relay.md)), every single-level subdomain — including `tv.` — was captured by the store worker: zone routes run in front of custom domains, and the store worker never calls through to the dashboard worker's exact custom domain behind it. Visits to `tv.dsh-market.com` therefore rendered the store SPA behind a still-working Access login — the relay branch only claims 16-character ids, so `tv` fell through to the homepage asset branch — which masked the routing change as a dashboard outage.

## Decision

The store worker owns the `tv.dsh-market.com` hostname explicitly: its fetch entry forwards the whole hostname to `dsh-market-telemetry-view` through the `TELEMETRY_VIEW` service binding before any other dispatch. Service bindings preserve headers, so `Cf-Access-Jwt-Assertion` rides along and the dashboard keeps verifying the Access JWT itself. `/app.js` joins `run_worker_first` because the store's own `/app.js` asset would otherwise be served assets-first on the captured hostname before the worker runs; on every other hostname the store worker now falls through to `env.ASSETS.fetch` for that path explicitly. The leftover root-only zone route `*.dsh-market.com` (the pre-fix pattern from the 2026-09-02 incident) was deleted from the zone, leaving the path-carrying `*.dsh-market.com/*` as the only wildcard route. `docs/telemetry.md` states the routing.

## Alternatives considered

Removing the wildcard zone route or the wildcard custom domain was rejected: the relay feature and its zero-config pairing depend on the wildcard capture ([stable-hostname relay](../feature/2026-09-02-stable-hostname-relay.md)). Moving the dashboard off the zone onto a workers.dev hostname behind Access was rejected: workers.dev is unreliable for China access and abandons the clean domain. Restoring exact-custom-domain precedence by re-attaching domains was rejected: the routing model puts zone routes in front of custom domains regardless of attachment order, so the capture would recur. Merging the dashboard code into the store worker was rejected: it couples the private viewer's deploy cadence and Access secrets to the public store worker.

## Consequences

The dashboard works again on `tv.dsh-market.com` once the store worker redeploys; the dashboard worker itself needed no change. The store worker now depends on `dsh-market-telemetry-view` existing at deploy time — service binding resolution fails the deploy otherwise, which is a loud and correct failure. Store behavior is otherwise unchanged: `/app.js` on every hostname except `tv.` is served from the same assets as before, and relay hosts keep proxying all paths including `/app.js` because the relay dispatch precedes the new branch. The `/data` proxy path needed no `run_worker_first` entry because no asset shadows it.

## Testing

`node --test scripts/market-tv-forward.test.mjs` (3 pass): the `tv.` hostname forwards with the Access JWT header intact for `/` and `/app.js`, and the store host serves its own `/app.js` asset without invoking the binding. Deployment evidence: the deploy-market workflow must pass with the new service binding, and an authenticated visit to `tv.dsh-market.com` must show the dashboard (owner browser check, since the Access gate blocks unauthenticated probes).
