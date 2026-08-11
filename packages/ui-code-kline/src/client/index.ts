/**
 * Code-K-line UI plugin, browser half: registers the workspace-row mini
 * K-line into the sidebar's workspace-row extension hole. The RPC fetch
 * (`codeKline.list`) is driven from the apply body through the store's audit
 * actions; components read snapshots via `useStore` and trigger loads via
 * the injected `ensure`.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-client-connection/client'
import { createCodeKlineStore } from './store.ts'
import type { WorkspaceKlineState } from './store.ts'
import { WorkspaceRowKline } from './WorkspaceRowKline.tsx'
import { en, NS, zh, type CodeKlineKey } from './locales.ts'

export type { WorkspaceRowKlineProps } from './WorkspaceRowKline.tsx'
export type { WorkspaceKlineCardProps } from './WorkspaceKlineCard.tsx'
export type { CodeKlineKey } from './locales.ts'
export { CandlestickChart, candleNetChange } from './CandlestickChart.tsx'
export type { CandlestickChartOptions } from './CandlestickChart.tsx'
export { createCodeKlineStore } from './store.ts'
export type { CodeKlineActions, CodeKlineState, WorkspaceKlineState } from './store.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Code-K-line row and panel copy. */
    'code-kline': CodeKlineKey
  }
}

/** The row hole this package fills. */
export const WORKSPACE_ROW_SLOT = 'sidebar.workspaces.workspaceRow' as const

/** The keyed dispatch key the browser host uses to render this occupant. */
export const CODE_KLINE_ENTRY_KEY = 'code-kline'

/** Injected actions the row component drives. */
export interface CodeKlineInjected {
  /**
   * Ensure the workspace's K-line is loaded (deduplicated in-flight);
   * error-state entries are retried on later calls, backed off.
   */
  ensure: (workspaceId: WorkspaceId, days?: number) => void
}

/** Required services: slot registration, locale, and the wire handle. */
export const inject = ['slots', 'locale', 'connection']

/**
 * Register the workspace-row mini K-line once its hole is on the ledger.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-code-kline: dictionaries')

  const store = createCodeKlineStore()
  const api = (ctx.get('connection') as ConnectionHandle | undefined)?.api
  const inflight = new Set<WorkspaceId>()
  /** Last ensure attempt per workspace, to back off error-state retries. */
  const lastAttempt = new Map<WorkspaceId, number>()
  /** Minimum gap between ensure attempts for the same workspace. */
  const ENSURE_RETRY_MS = 30_000

  // Baked actions arrive from the host machinery; ensure() drives the fetch
  // and commits through the same audit face components read from.
  const injected = (actions: { setEntry: (id: string, entry: WorkspaceKlineState) => void }) => ({
    ensure: (workspaceId: WorkspaceId, days?: number): void => {
      if (api === undefined || inflight.has(workspaceId)) return
      const now = Date.now()
      const last = lastAttempt.get(workspaceId)
      if (last !== undefined && now - last < ENSURE_RETRY_MS) return
      lastAttempt.set(workspaceId, now)
      inflight.add(workspaceId)
      actions.setEntry(workspaceId, { workspaceId, candles: [], state: 'loading', error: null })
      const payload = days === undefined ? { workspaceId } : { workspaceId, days }
      api.codeKline.list(payload).then((response) => {
        const { result } = response
        if (result.ok) {
          const kline = result.value
          actions.setEntry(workspaceId, {
            workspaceId,
            candles: kline.candles,
            ...(kline.reason === undefined ? {} : { reason: kline.reason }),
            state: 'ready',
            error: null,
          })
        } else {
          actions.setEntry(workspaceId, {
            workspaceId, candles: [], reason: 'scan-error', state: 'error', error: result.error,
          })
        }
      }, () => {
        actions.setEntry(workspaceId, {
          workspaceId, candles: [], reason: 'scan-error', state: 'error', error: null,
        })
      }).finally(() => {
        inflight.delete(workspaceId)
      })
    },
  })

  ctx.slots.inject(WORKSPACE_ROW_SLOT, () =>
    ctx.slots.register({
      name: WORKSPACE_ROW_SLOT,
      key: CODE_KLINE_ENTRY_KEY,
      store,
      inject: injected,
      locale: NS,
    }, WorkspaceRowKline))
}
