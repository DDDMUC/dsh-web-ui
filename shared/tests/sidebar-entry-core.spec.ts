import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSidebarEntry } from '../client/sidebar-entry-core.ts'

interface FakeRoot extends HTMLElement {
  _children: FakeElement[]
}

function el(tag: string, attrs: Record<string, string> = {}, children: FakeElement[] = []): FakeElement {
  const listeners = new Map<string, () => void>()
  return {
    tagName: tag.toUpperCase(),
    dataset: {},
    children,
    parentElement: undefined,
    nextElementSibling: undefined,
    isConnected: true,
    innerHTML: '',
    className: '',
    attrs,
    removed: false,
    setAttribute(name: string, value: string) {
      this.attrs[name] = value
      if (name.startsWith('data-')) this.dataset[name.slice('data-'.length)] = value
    },
    insertBefore(child: FakeElement, anchor?: FakeElement) {
      const index = anchor === undefined ? this.children.length : this.children.indexOf(anchor)
      this.children.splice(index < 0 ? this.children.length : index, 0, child)
      child.parentElement = this
      child.nextElementSibling = this.children[index + 1]
    },
    remove() { this.removed = true },
    addEventListener(name: string, fn: () => void) { listeners.set(name, fn) },
    click() { listeners.get('click')?.() },
    closest() { return null },
    matches(selector: string) { return selector.split(', ').some(s => s === attrs['data-marker'] && s !== '') || selector.includes('newSession') ? attrs['data-marker'] !== undefined : false },
    contains() { return false },
    querySelector(selector: string) {
      if (selector === 'button[class*="newSession"]') return newSession
      if (selector === '[data-pane="sidebar"], [class*="sidebarCol"]') return column
      return null
    },
    get firstElementChild() { return this.children[0] },
    get parentElementProp() { return this.parentElement },
  } as unknown as FakeElement
}

// Build the minimal fake shell: column > root, root has the new session button.
const newSession = el('button', {})
let column: FakeElement
let root: FakeElement

function installShell() {
  newSession.children = []
  root = el('div', {}, [newSession])
  column = el('div', {}, [root])
}

interface FakeElement {
  tagName: string
  dataset: Record<string, string>
  children: FakeElement[]
  parentElement: FakeElement | undefined
  nextElementSibling: FakeElement | undefined
  isConnected: boolean
  innerHTML: string
  className: string
  attrs: Record<string, string>
  removed: boolean
  setAttribute(name: string, value: string): void
  insertBefore(child: FakeElement, anchor?: FakeElement): void
  remove(): void
  addEventListener(name: string, fn: () => void): void
  click(): void
  closest(selector: string): FakeElement | null
  matches(selector: string): boolean
  contains(child: FakeElement): boolean
  querySelector(selector: string): FakeElement | null
  firstElementChild: FakeElement | undefined
}

afterEach(() => { vi.unstubAllGlobals() })

describe('shared sidebar-entry core', () => {
  it('mounts the row after the new session button and toggles on click', () => {
    installShell()
    let toggled = 0
    const mutations: Array<() => void> = []
    const observers: Array<{ disconnect(): void; observe(): void }> = []
    vi.stubGlobal('MutationObserver', class {
      constructor(readonly cb: () => void) { mutations.push(cb) }
      disconnect() {}
      observe() {}
    })
    const created: FakeElement[] = []
    vi.stubGlobal('document', {
      querySelector: (selector: string) => {
        if (selector === '[data-dsh-x-entry]') return null
        if (selector === '[data-pane="sidebar"], [class*="sidebarCol"]') return column
        if (selector === 'button[class*="newSession"]') return newSession
        return null
      },
      createElement: () => {
        const e = el('button', {})
        created.push(e)
        return e
      },
      body: { contains: () => true },
    })
    const dispose = mountSidebarEntry({
      rowAttribute: 'data-dsh-x-entry',
      rowSelector: '[data-dsh-x-entry]',
      icon: '<svg/>',
      css: { entry: 'entry-css', entryIcon: 'icon-css', entryLabel: 'label-css' },
      label: () => 'X',
      onToggle: () => { toggled += 1 },
      position: 'after',
      familySelectors: ['[data-dsh-x-entry]'],
    })
    expect(created).toHaveLength(1)
    expect(created[0]!.className).toBe('entry-css')
    expect(created[0]!.innerHTML).toContain('icon-css')
    expect(created[0]!.innerHTML).toContain('label-css')
    expect(created[0]!.innerHTML).toContain('<svg/>')
    expect(created[0]!.innerHTML).toContain('X')
    created[0]!.click()
    expect(toggled).toBe(1)
    dispose()
    expect(created[0]!.removed).toBe(true)
  })

  it('skips mounting when an entry row already exists (idempotency)', () => {
    installShell()
    let created = 0
    vi.stubGlobal('MutationObserver', class { disconnect() {} observe() {} })
    vi.stubGlobal('document', {
      querySelector: (selector: string) => selector === '[data-dsh-x-entry]' ? {} : null,
      createElement: () => { created += 1; return {} },
    })
    const dispose = mountSidebarEntry({
      rowAttribute: 'data-dsh-x-entry',
      rowSelector: '[data-dsh-x-entry]',
      icon: '<svg/>',
      css: {},
      label: () => 'X',
      onToggle: () => undefined,
      position: 'after',
      familySelectors: [],
    })
    expect(created).toBe(0)
    expect(dispose()).toBeUndefined()
  })

  it('highlights the row while the active state is open and clears on close', () => {
    installShell()
    let open = true
    const listeners = new Set<() => void>()
    vi.stubGlobal('MutationObserver', class { disconnect() {} observe() {} })
    const created: FakeElement[] = []
    vi.stubGlobal('document', {
      querySelector: (selector: string) => {
        if (selector === '[data-dsh-x-entry]') return null
        if (selector === '[data-pane="sidebar"], [class*="sidebarCol"]') return column
        if (selector === 'button[class*="newSession"]') return newSession
        return null
      },
      createElement: () => {
        const e = el('button', {})
        created.push(e)
        return e
      },
      body: { contains: () => true },
    })
    mountSidebarEntry({
      rowAttribute: 'data-dsh-x-entry',
      rowSelector: '[data-dsh-x-entry]',
      icon: '<svg/>',
      css: {},
      label: () => 'X',
      onToggle: () => undefined,
      position: 'after',
      familySelectors: [],
      active: {
        subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
        isOpen: () => open,
      },
    })
    expect(created[0]!.dataset['active']).toBe('true')
    open = false
    for (const listener of listeners) listener()
    expect(created[0]!.dataset['active']).toBeUndefined()
  })
})
