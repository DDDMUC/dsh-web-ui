/**
 * Mobile remote control — browser half. Registers the `remote` dictionaries,
 * the sidebar-foot entry (phone trigger + pairing panel) into the
 * ui-sidebar-declared `sidebar.remote` seat, and runs the phone-side boot
 * flow (pair accept + workspace deep-link + presence heartbeats) plus the
 * one-time failed-pair notice. Export discipline: packages/client/AGENTS.md
 * — the /client surface carries only what cordis loading needs plus types.
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale) and the
// ui-sidebar SlotMap merge (the 'sidebar.remote' hole).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { RemoteEntry } from './RemoteEntry.tsx'
import { PairFailedNotice } from './PairFailedNotice.tsx'
import { en, zh, type RemoteKey } from './locales.ts'
import { PAIR_FAILED_MARKER, runPairBootFlow } from './deep-link.ts'
import { sendHeartbeat } from './pair-api.ts'

export type { RemoteEntryProps } from './RemoteEntry.tsx'
export type { PanelState, RemotePanelProps } from './RemotePanel.tsx'
export type { PairFailedNoticeProps } from './PairFailedNotice.tsx'
export type { RemoteKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Mobile remote-control surface copy. */
    remote: RemoteKey
  }

  interface SlotMap {
    /**
     * The sidebar foot seat beside the settings trigger, declared by the
     * sidebar shell on deployments that carry the feature seat; the shell
     * passes only its column display state.
     */
    'sidebar.remote': { kind: 'single'; scope: 'root'; owner: SidebarRemoteOwnerProps }
  }
}

/** Owner share of the sidebar remote-control seat: the column display state the trigger renders against. */
export interface SidebarRemoteOwnerProps {
  /** Whether the sidebar renders wide content (false = 56px rail). */
  wide: boolean
}

/** Dictionary namespace owned by this plugin. */
const NS = 'remote'

/** Heartbeat cadence from a paired phone (presence + revocation liveness). */
const HEARTBEAT_INTERVAL_MS = 10_000

/** Services required by this plugin. */
export const inject = ['slots', 'locale', 'connection']

/**
 * Register the remote-control surface.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'remote-web-ui: dictionaries')

  const t = ctx.locale.bind(NS)

  // Sidebar foot entry: the shell declares 'sidebar.remote' in unconstrained
  // order, so registration is declaration-aware — slots.inject waits on the
  // declaration, removes the contribution when it collapses, and re-runs
  // after a redeclaration.
  const registerEntry = (): (() => void) =>
    ctx.slots.register({ name: 'sidebar.remote', locale: NS }, RemoteEntry)
  ctx.slots.inject('sidebar.remote', registerEntry)

  // Phone-side boot flow + heartbeats. Loopback pages (the desktop) never
  // heartbeat; the server ignores unpaired heartbeats anyway.
  const connection = ctx.get('connection') as ConnectionHandle | undefined
  const loopback = connection?.isLoopback ?? true
  ctx.effect(() => {
    runPairBootFlow(ctx, window.location.search)
    if (loopback) return () => {}
    const timer = window.setInterval(() => { void sendHeartbeat().catch(() => {}) }, HEARTBEAT_INTERVAL_MS)
    return () => { window.clearInterval(timer) }
  }, 'remote-web-ui: pair flow + heartbeats')

  // One-time failed-pair toast. The accept result lands asynchronously, so
  // the marker check is deferred past the accept round trip.
  ctx.effect(() => {
    const timer = window.setTimeout(() => {
      if (sessionStorage.getItem(PAIR_FAILED_MARKER) === null) return
      sessionStorage.removeItem(PAIR_FAILED_MARKER)
      const mount = document.createElement('div')
      document.body.appendChild(mount)
      const root = createRoot(mount)
      root.render(createElement(PairFailedNotice, { t }))
      // The toast owns its dismissal; the root lives for the page lifetime.
      void root
    }, 1500)
    return () => { window.clearTimeout(timer) }
  }, 'remote-web-ui: failed-pair notice')
}
