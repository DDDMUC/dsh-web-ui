/**
 * Mobile remote control for the dsh web GUI — host half. Mounts the pairing
 * service (one-time tokens, device sessions, revocation), the /api/pair
 * route family (issue/accept/stop/heartbeat/status/events), the api/gate
 * listener that enforces pairing on every other /api request from
 * non-loopback hosts, and the presence sweep. The browser half (the
 * `./client` entry) renders the sidebar entry, the pairing panel, and the
 * phone-side pair/accept + deep-link flow.
 */

import { setInterval as nodeSetInterval } from 'node:timers'
import type { Context } from 'cordis'
import z from 'schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-client-connection'
import { PairingService } from './pairing.ts'
import { makeGateListener } from './gate.ts'
import { makeRoutes } from './routes.ts'
import { lanIPv4Addresses } from './lan.ts'

/** Stable cordis plugin name. */
export const name = 'remote-web-ui'

/** Services required before the pairing surfaces can mount. */
export const inject = ['httpServer']

/** Plugin config, validated by the same-named schemastery schema. */
export interface Config {
  /** Token lifetime in ms; the QR link dies after this. */
  tokenTtlMs?: number
  /** A device is "online" while its lastSeenAt is newer than this (ms). */
  offlineAfterMs?: number
  /** Hard cap on paired device sessions (oldest evicted when full). */
  maxDevices?: number
  /** Cookie name carrying the paired device id. */
  cookieName?: string
  /**
   * When true (default), every non-loopback /api request must carry a live
   * paired-device cookie — the QR is the only way into a LAN-exposed dsh
   * web, and stop() genuinely cuts paired devices off. Set false to keep
   * the fence's open-LAN behavior and use pairing only for tokens/status.
   */
  requirePairingForLan?: boolean
}

export const Config: z<Config> = z.object({
  tokenTtlMs: z.number().step(1).min(60_000).default(10 * 60_000),
  offlineAfterMs: z.number().step(1).min(5_000).default(25_000),
  maxDevices: z.number().step(1).min(1).max(64).default(4),
  cookieName: z.string().min(1).default('dsh_pair'),
  requirePairingForLan: z.boolean().default(true),
})

/** Presence sweep cadence (a stale device flips to disconnected within two sweeps). */
const SWEEP_INTERVAL_MS = 10_000

/** Schema defaults, re-read for hand-built test contexts (the loader applies them normally). */
const DEFAULTS: Required<Omit<Config, never>> = {
  tokenTtlMs: 10 * 60_000,
  offlineAfterMs: 25_000,
  maxDevices: 4,
  cookieName: 'dsh_pair',
  requirePairingForLan: true,
}

/**
 * Mount the pairing service, routes, gate listener, and presence sweep.
 * @param ctx - host plugin context carrying httpServer.
 * @param config - resolved plugin config (schema defaults applied by the loader).
 */
export function apply(ctx: Context, config?: Config): void {
  const resolved: Required<Omit<Config, never>> = {
    tokenTtlMs: config?.tokenTtlMs ?? DEFAULTS.tokenTtlMs,
    offlineAfterMs: config?.offlineAfterMs ?? DEFAULTS.offlineAfterMs,
    maxDevices: config?.maxDevices ?? DEFAULTS.maxDevices,
    cookieName: config?.cookieName ?? DEFAULTS.cookieName,
    requirePairingForLan: config?.requirePairingForLan ?? DEFAULTS.requirePairingForLan,
  }
  const service = new PairingService({
    tokenTtlMs: resolved.tokenTtlMs,
    offlineAfterMs: resolved.offlineAfterMs,
    maxDevices: resolved.maxDevices,
    cookieName: resolved.cookieName,
  })
  // The bind facts are known by now (httpServer is an inject edge): the LAN
  // bases are frozen per process, matching the CLI's once-per-invocation
  // sampling stance. The QR can only advertise addresses the fence accepts;
  // every interface gets its own base URL so a multi-homed machine can pick
  // the network the phone can actually reach.
  const lanBases = ctx.httpServer.host === '0.0.0.0'
    ? lanIPv4Addresses().map(address => ({ address, base: `http://${address}:${String(ctx.httpServer.port)}` }))
    : []
  service.setLanBases(lanBases)
  const lanAddresses = lanBases.map(entry => entry.address)

  ctx.effect(
    () => ctx.on('api/gate', makeGateListener(service, resolved.requirePairingForLan)),
    'remote-web-ui: api gate',
  )

  const routes = makeRoutes({ service, lanAddresses })
  ctx.effect(
    () => {
      const disposers = routes.map(route => ctx.httpServer.register(route))
      return () => { for (const dispose of disposers) dispose() }
    },
    'remote-web-ui: pairing routes',
  )

  ctx.effect(
    () => {
      const timer = nodeSetInterval(() => { service.sweep() }, SWEEP_INTERVAL_MS)
      timer.unref()
      return () => { clearInterval(timer) }
    },
    'remote-web-ui: presence sweep',
  )
}
