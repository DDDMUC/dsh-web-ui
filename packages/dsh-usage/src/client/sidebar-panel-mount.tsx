/**
 * Sidebar usage panel mounting (issue #1592).
 *
 * The panel is a plain DOM row inserted into the sidebar right below the
 * usage entry row, carrying its own React root. Placement self-heals with the
 * same page-wide body-mutation hub the entry row uses; the entry row stays the
 * anchor, so the sidebar order never depends on this module's timing.
 * @module @linxin666/dsh-usage/client/sidebar-panel-mount
 */

import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { subscribeBodyInvalidations } from './body-mutations.ts'
import { UsageSidebarPanel, type UsageSidebarPanelProps } from './UsageSidebarPanel.tsx'
import { ENTRY_SELECTOR } from './sidebar-entry.ts'

/** Mounted panel controller: the entry row reads the open state to highlight. */
export interface UsagePanelMount {
  /** Whether the panel body is currently expanded. */
  isOpen(): boolean
  /** Subscribe to open/collapse changes (the entry row's active highlight). */
  subscribe(listener: () => void): () => void
  /** Open or collapse the panel. */
  toggle(): void
  /** Unmount the panel and remove its container. */
  dispose(): void
}

/**
 * Mount the sidebar usage panel below its entry row.
 * @param props - the store and poll/refresh callbacks of the apply body.
 * @returns the panel controller.
 */
export function mountUsagePanel(props: UsageSidebarPanelProps): UsagePanelMount {
  const container = document.createElement('div')
  container.setAttribute('data-dsh-usage-view', '')
  const root: Root = createRoot(container)
  root.render(createElement(UsageSidebarPanel, props))

  const listeners = new Set<() => void>()
  let open = true
  const emit = (): void => { for (const listener of [...listeners]) listener() }

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
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    toggle: () => {
      open = !open
      container.style.display = open ? '' : 'none'
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
