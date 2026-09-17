/**
 * Sidebar entry injection for the usage panel (issue #1592) — wiring over the
 * shared core. Unlike the panel-takeover family (task board / SSH / skill
 * center) this row does not participate in the family block, so it is placed
 * directly under the New Session row and ordered after those entries. The row
 * seats the panel's controls as trailing actions: a refresh command and a
 * collapse chevron mirroring the open state, so the panel below renders only
 * its content.
 * @module @linxin666/dsh-usage/client/sidebar-entry
 */

import { t } from './locales.ts'
import css from './usage.module.css'
import { mountSidebarEntry as mountSharedSidebarEntry, type SidebarEntryAction } from './sidebar-entry-core.ts'

/** Stable data attribute identifying the injected entry row. */
export const ENTRY_SELECTOR = '[data-dsh-usage-entry]'

/** Inline gauge glyph normalized to the shell's 18px navigation glyph size. */
const ICON = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12.5a7 7 0 0 1 11 -4.3"/><path d="M8 12.5V8.2l2.9-2.1"/><circle cx="8" cy="12.5" r="1"/></svg>'

/** Refresh glyph: a clockwise circular arrow, 14px like the sibling action icons. */
const REFRESH_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.4 8a5.4 5.4 0 1 1-1.58-3.82"/><path d="M13.4 2.6v2.7h-2.7"/></svg>'

/** Disclosure chevrons: down while expanded, right while collapsed. */
const CHEVRON_OPEN_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>'
const CHEVRON_CLOSED_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg>'

/** Refresh cooldown: one forced probe cycle per click, the icon spins meanwhile. */
const REFRESH_COOLDOWN_MS = 3000

/** Locale-change subscription the shared core asks for (ctx.locale.subscribe shape). */
export interface LocaleRefreshSource { subscribe(listener: () => void): () => void }

/** Panel-facing callbacks and state the entry row's controls drive. */
export interface UsageSidebarEntryHandlers {
  /** Toggles the panel (the row's main area and the collapse chevron). */
  onToggle(): void
  /** Forces one host probe cycle (the refresh action). */
  onRefresh(): void
  /** Reads the panel's expanded state (row highlight and chevron direction). */
  isOpen(): boolean
  /** Subscribes to expanded-state changes (the chevron mirrors them live). */
  subscribeOpen(listener: () => void): () => void
}

/** Trailing actions seated at the row's right edge. */
function entryActions(handlers: UsageSidebarEntryHandlers): readonly SidebarEntryAction[] {
  return [
    {
      id: 'refresh',
      icon: REFRESH_ICON,
      label: () => t('usage.refresh'),
      onClick: (button) => {
        handlers.onRefresh()
        button.disabled = true
        window.setTimeout(() => { button.disabled = false }, REFRESH_COOLDOWN_MS)
      },
    },
    {
      id: 'collapse',
      icon: CHEVRON_OPEN_ICON,
      inactiveIcon: CHEVRON_CLOSED_ICON,
      label: (open) => t(open ? 'usage.sidebar.toggle.collapse' : 'usage.sidebar.toggle.expand'),
      onClick: () => { handlers.onToggle() },
    },
  ]
}

/**
 * Mount the usage sidebar entry.
 * @param handlers - the panel's toggle/refresh callbacks and open-state face.
 * @param locale - locale-change source; when given, re-applies the label on a
 *   language switch (the plain-DOM row otherwise keeps the mount-time copy).
 * @returns disposer removing the entry and its observers.
 */
export function mountSidebarEntry(
  handlers: UsageSidebarEntryHandlers,
  locale?: LocaleRefreshSource,
): () => void {
  return mountSharedSidebarEntry({
    rowAttribute: 'data-dsh-usage-entry',
    rowSelector: ENTRY_SELECTOR,
    plugin: 'usage',
    icon: ICON,
    css,
    label: () => t('usage.sidebar.entry.label'),
    tooltip: () => t('usage.sidebar.entry.tooltip'),
    refresh: locale === undefined ? undefined : { subscribe: (listener) => locale.subscribe(listener) },
    onToggle: handlers.onToggle,
    actions: entryActions(handlers),
    // Directly after the family entries (task board / SSH / skill center) and
    // before the workspace browser, matching the requested sidebar order.
    position: 'after',
    familySelectors: ['[data-dsh-taskboard-entry]', '[data-dsh-ssh-entry]', '[data-dsh-skill-explorer-entry]', '[data-dsh-usage-entry]'],
    active: {
      subscribe: handlers.subscribeOpen,
      isOpen: handlers.isOpen,
    },
  })
}
