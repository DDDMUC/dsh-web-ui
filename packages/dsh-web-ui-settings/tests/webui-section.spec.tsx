/** @vitest-environment jsdom */

/**
 * The Web UI group settings section contract: it renders as a first-level
 * settings page whose own nav item hosts the group card. The card body stays
 * collapsed until the header expands, then renders every family plugin card
 * through the child slot.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { WebUIPluginsSection } from '../src/client/WebUIPluginsCard.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

/**
 * English translate stub (same shape the sibling settings-card tests use).
 * Reads from the published dictionary and falls back to the key.
 */
const t = (key: string): string => (en as Record<string, string>)[key] ?? key

describe('WebUIPluginsSection', () => {
  it('renders the group card header inside a list with the body collapsed', () => {
    const renderSlot = vi.fn(() => null)
    const props = { t, renderSlot } as ComponentProps<typeof WebUIPluginsSection>
    render(<WebUIPluginsSection {...props} />)

    const header = screen.getByRole('button', { name: /show plugins: web ui plugins|web ui plugins/i })
    expect(header).toBeTruthy()
    expect(header.getAttribute('aria-expanded')).toBe('false')

    const list = document.querySelector('ul')
    expect(list).toBeTruthy()
    expect(list!.contains(header)).toBe(true)
    expect(renderSlot).not.toHaveBeenCalled()
  })

  it('renders the family plugin cards after the header expands', () => {
    const renderSlot = vi.fn(() => null)
    const props = { t, renderSlot } as ComponentProps<typeof WebUIPluginsSection>
    render(<WebUIPluginsSection {...props} />)

    fireEvent.click(screen.getByRole('button', { name: /show plugins: web ui plugins|web ui plugins/i }))

    expect(renderSlot).toHaveBeenCalledTimes(1)
  })
})
