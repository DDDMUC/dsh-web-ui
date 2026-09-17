/**
 * Sidebar usage panel (issue #1592): the usage body seated directly under the
 * sidebar entry row. The row carries the panel's controls (refresh, collapse
 * chevron), so this component renders only the content: expanded, plan
 * providers show their quota windows and balance-only providers their
 * remaining amount; collapsed, a one-line strip shows the current session
 * provider's today usage (tokens, calls, and cost when priced) from the same
 * /api/dsh-usage/overview document the settings section renders. The open
 * state lives in the mount (persisted to localStorage) and arrives through
 * the open face; polling runs at 10s expanded, 30s collapsed, and pauses
 * while the page is hidden.
 * @module @linxin666/dsh-usage/client/UsageSidebarPanel
 */

import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { t } from './locales.ts'
import styles from './usage.module.css'
import { formatTokens } from './UsageSectionCard.tsx'
import type { UsageStoreInstance } from './usage-store.ts'
import { adapterFor } from '../core/adapters.ts'
import { totalTokens } from '../core/ledger.ts'
import type { ProviderSnapshotView, UsageOverviewView, UsageTokenTotals } from '../core/types.ts'
import { addTotals, emptyTotals } from '../core/types.ts'

/** Expanded-state face the owning mount supplies (subscribe + current value). */
export interface OpenStateSource {
  subscribe(listener: () => void): () => void
  isOpen(): boolean
}

/** Props of the sidebar panel (the apply body supplies the store and poller). */
export interface UsageSidebarPanelProps {
  store: UsageStoreInstance
  /** Fetch one overview now. */
  poll: () => void
  /** Expanded state owned by the mount; false renders nothing and pauses polling. */
  open: OpenStateSource
}

/** Poll cadence while the panel is expanded and the page visible. */
const PANEL_POLL_MS = 10_000

/**
 * Poll cadence of the collapsed strip: the current session's usage should
 * stay visibly live, but a collapsed surface pays a relaxed cadence instead
 * of the expanded one.
 */
const COLLAPSED_POLL_MS = 30_000

/** Bar tone, matching the settings section's thresholds. */
function tone(percent: number): string {
  if (percent >= 90) return styles.barLow
  if (percent >= 70) return styles.barWarn
  return styles.sidebarBarFill
}

/**
 * The collapsed-strip facts for the current provider: display name plus
 * today's adapter-family totals (tokens, calls, cost). The host serves them
 * strip-ready inside `current`; an older host document is derived against
 * here. Undefined on a day without usage — a strip about nothing is noise.
 */
function collapsedSummary(snapshot: UsageOverviewView): { name: string; totals: UsageTokenTotals } | undefined {
  const provider = snapshot.current.provider
  if (provider === undefined) return undefined
  const name = snapshot.current.displayName
    ?? snapshot.providers.find((entry) => entry.provider === provider)?.displayName
    ?? provider
  if (snapshot.current.today !== undefined) {
    const totals = snapshot.current.today
    return totals.calls > 0 && totalTokens(totals) > 0 ? { name, totals } : undefined
  }
  const family = adapterFor(provider)
  let merged = emptyTotals()
  for (const row of snapshot.usage.today.providers) {
    const same = family === undefined ? row.provider === provider : adapterFor(row.provider) === family
    if (same) merged = addTotals(merged, row.totals)
  }
  return merged.calls > 0 && totalTokens(merged) > 0 ? { name, totals: merged } : undefined
}

/** A provider is worth listing when it is configured and carries a fact. */
function listable(provider: ProviderSnapshotView): boolean {
  return provider.credential !== 'none' && (provider.plan !== undefined || provider.balance !== undefined)
}

/** One provider row: plan windows when present, otherwise the balance line. */
function ProviderBlock(props: { provider: ProviderSnapshotView }): ReactNode {
  const { provider } = props
  const windows = provider.plan?.windows ?? []
  if (windows.length > 0) {
    return (
      <div className={styles.sidebarProvider} data-dsh-part="sidebar-provider">
        <div className={styles.sidebarProviderHead}>
          <span className={styles.sidebarProviderName}>{provider.displayName}</span>
        </div>
        {windows.map((window) => (
          <div key={window.key} className={styles.sidebarWindowRow} data-dsh-part="sidebar-window">
            <span>{window.name ?? t(`usage.plan.windows.${window.key}`)}</span>
            {window.percent !== undefined && (
              <>
                <span className={styles.sidebarBar}>
                  <span className={tone(window.percent)} style={{ width: `${Math.min(100, Math.max(0, window.percent))}%` }} />
                </span>
                <span>{window.percent >= 10 ? Math.round(window.percent) : window.percent.toFixed(1)}%</span>
              </>
            )}
          </div>
        ))}
      </div>
    )
  }
  if (provider.balance !== undefined) {
    return (
      <div className={styles.sidebarProvider} data-dsh-part="sidebar-provider">
        <div className={styles.sidebarProviderHead}>
          <span className={styles.sidebarProviderName}>{provider.displayName}</span>
          <span className={styles.sidebarBalance}>
            {t('usage.sidebar.balanceLeft', { balance: `${provider.balance.currency} ${provider.balance.totalBalance}` })}
          </span>
        </div>
      </div>
    )
  }
  return null
}

/**
 * Render the sidebar usage panel body.
 * @param props - store, the poll callback, and the mount's open-state face.
 * @returns the panel content, or null while collapsed.
 */
export function UsageSidebarPanel(props: UsageSidebarPanelProps): ReactNode {
  const { store, poll, open: openState } = props
  const ui = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const open = useSyncExternalStore(openState.subscribe, openState.isOpen)

  // The strip stays live at a relaxed cadence while collapsed; the
  // expanded panel keeps the section's own 10s cadence. A hidden tab always
  // pauses, matching the settings section's gating.
  useEffect(() => {
    poll()
    const cadence = open ? PANEL_POLL_MS : COLLAPSED_POLL_MS
    let timer: number | undefined
    const start = (): void => {
      if (timer === undefined && document.visibilityState === 'visible') timer = window.setInterval(poll, cadence)
    }
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') {
        poll()
        start()
      } else if (timer !== undefined) {
        window.clearInterval(timer)
        timer = undefined
      }
    }
    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      if (timer !== undefined) window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [poll, open])

  const snapshot: UsageOverviewView | null = ui.snapshot

  if (!open) {
    const summary = snapshot === null ? undefined : collapsedSummary(snapshot)
    if (summary === undefined) return null
    return (
      <div className={styles.sidebarSummary} data-dsh-plugin="usage" data-dsh-part="sidebar-summary">
        <span className={styles.sidebarSummaryName}>{summary.name}</span>
        <span className={styles.sidebarSummaryFacts}>
          {t('usage.sidebar.todayUsage', { tokens: formatTokens(totalTokens(summary.totals)) })}
          {' · '}
          {t('usage.calls', { n: summary.totals.calls })}
          {summary.totals.cost > 0 ? ` · ¥${summary.totals.cost.toFixed(2)}` : ''}
        </span>
      </div>
    )
  }

  const providers = snapshot === null ? [] : snapshot.providers.filter(listable)

  return (
    <div className={styles.sidebarPanel} data-dsh-plugin="usage" data-dsh-part="sidebar-panel">
      {ui.status === 'error'
        ? <span className={styles.sidebarMuted}>{t('usage.sidebar.error', { error: ui.error ?? '' })}</span>
        : snapshot === null
          ? <span className={styles.sidebarMuted}>{t('usage.sidebar.loading')}</span>
          : providers.length === 0
            ? <span className={styles.sidebarMuted}>{t('usage.sidebar.empty')}</span>
            : providers.map((provider) => <ProviderBlock key={provider.provider} provider={provider} />)}
    </div>
  )
}
