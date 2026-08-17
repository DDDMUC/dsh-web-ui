/** @vitest-environment jsdom */

/**
 * The staged BooleanField / ChoiceField contract: under the default
 * appearance they render a self-drawn listbox (animated open/close,
 * WAI-ARIA listbox keyboard pattern, same value semantics as the native
 * select), and while an appearance skin is active they fall back to the
 * legacy native `<select>` so element-level skin selectors keep working
 * unchanged. Body markers planted here are cleared after every test.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BooleanField, ChoiceField, type FieldProps } from '../src/client/PluginSettingsCard.tsx'

afterEach(() => {
  cleanup()
  // Drop every body dataset marker the test (or the skin branch) planted.
  for (const key of Object.keys(document.body.dataset)) {
    delete (document.body.dataset as unknown as Record<string, unknown>)[key]
  }
})

/** Field props with stable copy defaults; override per test. */
const base = (overrides: Partial<FieldProps> = {}): FieldProps => ({
  id: 'field-1',
  label: 'Field',
  hint: 'hint copy',
  text: '',
  overridden: false,
  invalid: false,
  overriddenLabel: 'overridden',
  resetLabel: 'reset',
  invalidLabel: 'invalid copy',
  disabled: false,
  onEdit: () => {},
  onReset: () => {},
  ...overrides,
})

const bool = (overrides: Partial<FieldProps> = {}) => (
  <BooleanField {...base(overrides)} inheritLabel="Inherit" onLabel="On" offLabel="Off" />
)

describe('BooleanField default appearance', () => {
  it('renders a self-drawn listbox instead of a native select', () => {
    render(bool())
    expect(screen.queryByRole('combobox')).toBeNull()
    const trigger = screen.getByRole('button', { name: 'Field' })
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('opens on trigger click and closes after staging an option', async () => {
    const onEdit = vi.fn()
    render(bool({ onEdit }))
    const trigger = screen.getByRole('button', { name: 'Field' })
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(3)
    expect(options[0]?.getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('option', { name: 'On' }))
    expect(onEdit).toHaveBeenCalledWith('true')
    // The popup stays mounted for the close transition, then unmounts.
    expect(screen.queryByRole('listbox')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  })

  it('toggles closed on a second trigger click without staging', async () => {
    const onEdit = vi.fn()
    render(bool({ onEdit }))
    const trigger = screen.getByRole('button', { name: 'Field' })
    fireEvent.click(trigger)
    expect(screen.getByRole('listbox')).toBeTruthy()
    fireEvent.click(trigger)
    expect(onEdit).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  })

  it('supports the keyboard listbox pattern', async () => {
    const onEdit = vi.fn()
    render(bool({ onEdit }))
    const trigger = screen.getByRole('button', { name: 'Field' })
    // ArrowDown opens with the current value highlighted…
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.getByRole('listbox')).toBeTruthy()
    // …a second ArrowDown moves the highlight to "On"…
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(trigger.getAttribute('aria-activedescendant')).toBe('field-1-o1')
    // …and Enter stages it and closes.
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(onEdit).toHaveBeenCalledWith('true')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    // Escape closes without staging anything else.
    fireEvent.keyDown(trigger, { key: 'ArrowUp' })
    expect(screen.getByRole('listbox')).toBeTruthy()
    fireEvent.keyDown(trigger, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('closes when a pointerdown lands outside the field', async () => {
    render(bool())
    fireEvent.click(screen.getByRole('button', { name: 'Field' }))
    expect(screen.getByRole('listbox')).toBeTruthy()
    fireEvent.pointerDown(document.body)
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  })

  it('never opens when disabled', () => {
    render(bool({ disabled: true }))
    const trigger = screen.getByRole('button', { name: 'Field' }) as HTMLButtonElement
    expect(trigger.disabled).toBe(true)
    fireEvent.click(trigger)
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('shows the current option copy and an empty trigger for unmatched drafts', () => {
    const view = render(bool({ text: 'true' }))
    expect(screen.getByRole('button', { name: 'Field' }).textContent).toBe('On')
    view.rerender(bool({ text: 'nonsense' }))
    expect(screen.getByRole('button', { name: 'Field' }).textContent).toBe('')
  })

  it('keeps the overridden badge and reset control untouched', () => {
    const onReset = vi.fn()
    render(bool({ overridden: true, onReset }))
    expect(screen.getByText('overridden')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'reset' }))
    expect(onReset).toHaveBeenCalledTimes(1)
  })
})

describe('ChoiceField default appearance', () => {
  it('prepends the inherit option to the choices', () => {
    render(
      <ChoiceField
        {...base({})}
        inheritLabel="Inherit"
        choices={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Field' }))
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(3)
    expect(options[0]?.textContent).toBe('Inherit')
    expect(options[1]?.textContent).toBe('A')
    expect(options[2]?.textContent).toBe('B')
  })

  it('keeps the invalid hint and marks the trigger invalid', () => {
    render(
      <ChoiceField
        {...base({ invalid: true })}
        inheritLabel="Inherit"
        choices={[{ value: 'a', label: 'A' }]}
      />,
    )
    expect(screen.getByText('invalid copy')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Field' }).getAttribute('aria-invalid')).toBe('true')
  })
})

describe('skin fallback', () => {
  it('renders the native select while an appearance skin is active', () => {
    document.body.dataset.dshMiku = ''
    const onEdit = vi.fn()
    render(bool({ onEdit }))
    const select = screen.getByRole('combobox')
    expect(select).toBeTruthy()
    expect(screen.getAllByRole('option')).toHaveLength(3)
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.change(select, { target: { value: 'true' } })
    expect(onEdit).toHaveBeenCalledWith('true')
  })

  it('ignores the skin-center and collapsed-sidebar body markers', () => {
    document.body.dataset.dshSkinCenter = ''
    document.body.dataset.dshSidebarCollapsed = ''
    render(bool())
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByRole('button', { name: 'Field' })).toBeTruthy()
  })

  it('returns to the self-drawn listbox once the skin marker is gone', () => {
    document.body.dataset.dshMiku = ''
    const view = render(bool())
    expect(screen.getByRole('combobox')).toBeTruthy()
    delete document.body.dataset.dshMiku
    view.rerender(bool())
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByRole('button', { name: 'Field' })).toBeTruthy()
  })
})
