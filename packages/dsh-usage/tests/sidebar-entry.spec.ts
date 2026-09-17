/** @vitest-environment jsdom */

/**
 * Usage sidebar entry row (issue #1592): the panel's controls live on the row
 * itself — a refresh command and a collapse chevron mirroring the open state —
 * seated through the shared core's trailing actions.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mountSidebarEntry, ENTRY_SELECTOR } from '../src/client/sidebar-entry.ts'

afterEach(() => {
  document.body.innerHTML = ''
})

beforeEach(() => {
  document.documentElement.lang = 'en'
})

/** The shell geometry the shared core anchors to: column > wrapper > root(logoRow owner). */
function shellRoot(): HTMLElement {
  const column = document.createElement('div')
  column.setAttribute('data-pane', 'sidebar')
  const wrapper = document.createElement('div')
  const root = document.createElement('div')
  const logoRow = document.createElement('div')
  logoRow.className = 'shelllogoRow'
  const newSession = document.createElement('button')
  newSession.className = 'shellnewSession'
  logoRow.append(newSession)
  root.append(logoRow)
  wrapper.append(root)
  column.append(wrapper)
  document.body.append(column)
  return root
}

/** Mutable panel face mirroring the mount's handlers and open-state contract. */
function panelFace(initial: boolean) {
  const listeners = new Set<() => void>()
  const face = {
    toggles: 0,
    refreshes: 0,
    open: initial,
    onToggle(): void { face.toggles += 1 },
    onRefresh(): void { face.refreshes += 1 },
    isOpen(): boolean { return face.open },
    subscribeOpen(listener: () => void): () => void {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set(next: boolean): void {
      face.open = next
      for (const listener of [...listeners]) listener()
    },
  }
  return face
}

describe('mountSidebarEntry usage controls (issue #1592)', () => {
  it('user sees the refresh and collapse controls seated on the entry row', () => {
    // Given the sidebar shell and an expanded panel
    shellRoot()
    const panel = panelFace(true)

    // When the entry row mounts
    const dispose = mountSidebarEntry(panel)
    const row = document.querySelector(ENTRY_SELECTOR)

    // Then the row carries the label and both localized action buttons
    expect(document.querySelectorAll(ENTRY_SELECTOR)).toHaveLength(1)
    expect(row?.textContent).toContain('Usage')
    expect(row?.querySelectorAll('[data-dsh-entry-action]')).toHaveLength(2)
    const refresh = row?.querySelector('[data-dsh-entry-action="refresh"]')
    const collapse = row?.querySelector('[data-dsh-entry-action="collapse"]')
    expect(refresh?.getAttribute('aria-label')).toBe('Refresh')
    expect(collapse?.getAttribute('aria-label')).toBe('Collapse')
    expect(collapse?.getAttribute('aria-expanded')).toBe('true')
    dispose()
  })

  it('user clicking refresh forces one probe cycle and cools the button down', () => {
    // Given the mounted entry row of an expanded panel
    shellRoot()
    const panel = panelFace(true)
    const dispose = mountSidebarEntry(panel)
    const refresh = document.querySelector<HTMLButtonElement>('[data-dsh-entry-action="refresh"]')

    // When the user clicks the refresh action
    refresh?.click()

    // Then one probe cycle is forced, the button cools down, and the panel stays put
    expect(panel.refreshes).toBe(1)
    expect(refresh?.disabled).toBe(true)
    expect(panel.toggles).toBe(0)
    dispose()
  })

  it('user clicking the chevron or the row body toggles the panel', () => {
    // Given the mounted entry row of an expanded panel
    shellRoot()
    const panel = panelFace(true)
    const dispose = mountSidebarEntry(panel)
    const row = document.querySelector(ENTRY_SELECTOR)
    const collapse = row?.querySelector<HTMLButtonElement>('[data-dsh-entry-action="collapse"]')
    const main = row?.querySelector<HTMLButtonElement>('[aria-label="Usage"]')

    // When the user clicks the chevron
    collapse?.click()

    // Then the panel toggles once without a probe cycle
    expect(panel.toggles).toBe(1)
    expect(panel.refreshes).toBe(0)

    // When the user clicks the row's main area
    main?.click()

    // Then the panel toggles again
    expect(panel.toggles).toBe(2)
    dispose()
  })

  it('user sees the chevron mirror the collapse and expansion', () => {
    // Given the mounted entry row of an expanded panel
    shellRoot()
    const panel = panelFace(true)
    const dispose = mountSidebarEntry(panel)
    const collapse = document.querySelector('[data-dsh-entry-action="collapse"]')
    const expandedIcon = collapse?.innerHTML

    // When the panel collapses
    panel.set(false)

    // Then the chevron flips direction, offers Expand, and reports the collapsed state
    expect(collapse?.getAttribute('aria-expanded')).toBe('false')
    expect(collapse?.getAttribute('aria-label')).toBe('Expand')
    expect(collapse?.innerHTML === expandedIcon).toBe(false)

    // When the panel expands again
    panel.set(true)

    // Then the chevron restores the expanded affordance
    expect(collapse?.getAttribute('aria-expanded')).toBe('true')
    expect(collapse?.getAttribute('aria-label')).toBe('Collapse')
    expect(collapse?.innerHTML).toBe(expandedIcon)
    dispose()
  })
})
