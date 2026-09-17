/**
 * Sidebar usage panel mounting (issue #1592).
 *
 * The panel is a plain DOM row inserted into the sidebar right below the
 * usage entry row, carrying its own React root. Placement self-heals with the
 * same page-wide body-mutation hub the entry row uses; the entry row stays the
 * anchor, so the sidebar order never depends on this module's timing.
 *
 * The mount owns the panel's single open state: initialized from localStorage,
 * flipped by the entry row's toggle controls, and mirrored to the React body
 * through the subscribe/isOpen face (the same face the entry row's chevron
 * and highlight read).
 * @module @linxin666/dsh-usage/client/sidebar-panel-mount
 */

import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { subscribeBodyInvalidations } from './body-mutations.ts'
import { UsageSidebarPanel, type OpenStateSource } from './UsageSidebarPanel.tsx'
import type { UsageStoreInstance } from './usage-store.ts'
import { ENTRY_SELECTOR } from './sidebar-entry.ts'

/** localStorage key holding the collapsed flag ('1' = collapsed). */
export const COLLAPSED_STORAGE_KEY = 'dsh-usage.sidebar.collapsed'

/** Read the persisted collapsed flag (absent = expanded). */
function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1'
  } catch {
    // Storage can be unavailable (privacy modes); the panel stays expanded.
    return false
  }
}

/** Persist the collapsed flag; storage failures keep the session state. */
function writeCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0')
  } catch {
    // Storage unavailable: the state still flips for this session.
  }
}

/** Panel inputs the mount forwards into the React tree. */
export interface UsagePanelMountProps {
  store: UsageStoreInstance
  /** Fetch one overview now. */
  poll: () => void
}

/** Mounted panel controller: the entry row drives the toggle and mirrors the state. */
export interface UsagePanelMount {
  /** Whether the panel body is currently expanded. */
  isOpen(): boolean
  /** Subscribe to open/collapse changes (the entry row's chevron and highlight). */
  subscribe(listener: () => void): () => void
  /** Flip the open state, persist it, and notify subscribers. */
  toggle(): void
  /** Unmount the panel and remove its container. */
  dispose(): void
}

/**
 * Mount the sidebar usage panel below its entry row.
 * @param props - the store and poll callback of the apply body.
 * @returns the panel controller.
 */
export function mountUsagePanel(props: UsagePanelMountProps): UsagePanelMount {
  const container = document.createElement('div')
  container.setAttribute('data-dsh-usage-view', '')

  const listeners = new Set<() => void>()
  let open = !readCollapsed()
  const emit = (): void => { for (const listener of [...listeners]) listener() }
  const openState: OpenStateSource = {
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    isOpen: () => open,
  }

  const root: Root = createRoot(container)
  root.render(createElement(UsageSidebarPanel, { store: props.store, poll: props.poll, open: openState }))

  /** Keep the panel as the row directly after the usage entry. */
  const place = (): void => {
    const entry = document.querySelector<HTMLElement>(ENTRY_SELECTOR)
    if (entry === null || entry.parentElement === null) return
    if (container.parentElement !== entry.parentElement || entry.nextElementSibling !== container) {
      entry.parentElement.insertBefore(container, entry.nextElementSibling)
    }
  }
  place()
  const unsubscribeBody = subscribeBodyInvalidations(place)

  return {
    isOpen: () => open,
    subscribe: openState.subscribe,
    toggle: () => {
      open = !open
      writeCollapsed(!open)
      emit()
    },
    dispose: () => {
      unsubscribeBody()
      root.unmount()
      container.remove()
      listeners.clear()
    },
  }
}
