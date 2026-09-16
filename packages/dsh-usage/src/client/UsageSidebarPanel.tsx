/**
 * Sidebar usage panel (issue #1592): a collapsible usage surface in the
 * sidebar, mounted directly under the family entry block. It reads the same
 * /api/dsh-usage/overview document the settings section renders — plan
 * providers show their quota windows, balance-only providers their remaining
 * amount — and polls only while the panel is expanded and the page visible.
 * @module @linxin666/dsh-usage/client/UsageSidebarPanel
 */

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { t } from './locales.ts'
import styles from './usage.module.css'
import type { UsageStoreInstance } from './usage-store.ts'
import type { ProviderSnapshotView, UsageOverviewView } from '../core/types.ts'

/** Props of the sidebar panel (the apply body supplies the store and poller). */
export interface UsageSidebarPanelProps {
  store: UsageStoreInstance
  /** Fetch one overview now. */
  poll: () => void
  /** Force a host probe cycle now. */
  refresh: () => void
}

/** Poll cadence while the panel is expanded and the page visible. */
const PANEL_POLL_MS = 10_000

/** localStorage key holding the collapsed flag ('1' = collapsed). */
export const COLLAPSED_STORAGE_KEY = 'dsh-usage.sidebar.collapsed'

/** Bar tone, matching the settings section's thresholds. */
function tone(percent: number): string {
  if (percent >= 90) return styles.barLow
  if (percent >= 70) return styles.barWarn
  return styles.sidebarBarFill
}

/** Read the persisted collapsed flag (absent = expanded). */
function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1'
  } catch {
    // Storage can be unavailable (privacy modes); the panel stays expanded.
    return false
  }
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
 * Render the sidebar usage panel.
 * @param props - store plus the poll/refresh callbacks of the apply body.
 * @returns the panel body (no wrapper: the entry row owns the placement).
 */
export function UsageSidebarPanel(props: UsageSidebarPanelProps): ReactNode {
  const { store, poll, refresh } = props
  const ui = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [refreshing, setRefreshing] = useState(false)

  const toggle = (): void => {
    setCollapsed((current) => {
      const next = !current
      try {
        window.localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? '1' : '0')
      } catch {
        // Storage unavailable: the state still flips for this session.
      }
      return next
    })
  }

  // Poll only while expanded and visible: a collapsed panel and a hidden tab
  // cost nothing, matching the settings section's own gating.
  useEffect(() => {
    if (collapsed) return undefined
    poll()
    let timer: number | undefined
    const start = (): void => {
      if (timer === undefined && document.visibilityState === 'visible') timer = window.setInterval(poll, PANEL_POLL_MS)
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
  }, [poll, collapsed])

  const onRefresh = (): void => {
    setRefreshing(true)
    refresh()
    window.setTimeout(() => setRefreshing(false), 3000)
  }

  const snapshot: UsageOverviewView | null = ui.snapshot
  const providers = snapshot === null ? [] : snapshot.providers.filter(listable)

  return (
    <div className={styles.sidebarPanel} data-dsh-plugin="usage" data-dsh-part="sidebar-panel">
      <div className={styles.sidebarPanelHead}>
        <span>{t('usage.sidebar.title')}</span>
        <span>
          {!collapsed && (
            <button type="button" className={styles.sidebarToggle} onClick={onRefresh} disabled={refreshing}>
              {refreshing ? t('usage.refreshing') : t('usage.refresh')}
            </button>
          )}
          <button
            type="button"
            className={styles.sidebarToggle}
            aria-expanded={!collapsed}
            onClick={toggle}
          >
            {collapsed ? t('usage.sidebar.toggle.expand') : t('usage.sidebar.toggle.collapse')}
          </button>
        </span>
      </div>
      {!collapsed && (
        ui.status === 'error'
          ? <span className={styles.sidebarMuted}>{t('usage.sidebar.error', { error: ui.error ?? '' })}</span>
          : snapshot === null
            ? <span className={styles.sidebarMuted}>{t('usage.sidebar.loading')}</span>
            : providers.length === 0
              ? <span className={styles.sidebarMuted}>{t('usage.sidebar.empty')}</span>
              : providers.map((provider) => <ProviderBlock key={provider.provider} provider={provider} />)
      )}
    </div>
  )
}
