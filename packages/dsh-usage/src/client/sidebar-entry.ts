/**
 * Sidebar entry injection for the usage panel (issue #1592) — wiring over the
 * shared core. Unlike the panel-takeover family (task board / SSH / skill
 * center) this row does not participate in the family block, so it is placed
 * directly under the New Session row and ordered after those entries.
 * @module @linxin666/dsh-usage/client/sidebar-entry
 */

import { t } from './locales.ts'
import css from './usage.module.css'
import { mountSidebarEntry as mountSharedSidebarEntry } from './sidebar-entry-core.ts'

/** Stable data attribute identifying the injected entry row. */
export const ENTRY_SELECTOR = '[data-dsh-usage-entry]'

/** Inline gauge glyph normalized to the shell's 18px navigation glyph size. */
const ICON = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12.5a7 7 0 0 1 11 -4.3"/><path d="M8 12.5V8.2l2.9-2.1"/><circle cx="8" cy="12.5" r="1"/></svg>'

/** Locale-change subscription the shared core asks for (ctx.locale.subscribe shape). */
export interface LocaleRefreshSource { subscribe(listener: () => void): () => void }

/**
 * Mount the usage sidebar entry.
 * @param onToggle - toggles the panel below the row.
 * @param isOpen - reads the panel's expanded state (row highlight).
 * @param locale - locale-change source; when given, re-applies the label on a
 *   Language switch (the plain-DOM row otherwise keeps the mount-time copy).
 * @returns disposer removing the entry and its observers.
 */
export function mountSidebarEntry(
  onToggle: () => void,
  isOpen: () => boolean,
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
    onToggle,
    // Directly after the family entries (task board / SSH / skill center) and
    // before the workspace browser, matching the requested sidebar order.
    position: 'after',
    familySelectors: ['[data-dsh-taskboard-entry]', '[data-dsh-ssh-entry]', '[data-dsh-skill-explorer-entry]', '[data-dsh-usage-entry]'],
    active: {
      subscribe: (listener) => { void listener; return () => {} },
      isOpen,
    },
  })
}
