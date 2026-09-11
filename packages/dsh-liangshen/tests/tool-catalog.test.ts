import { describe, expect, test } from 'vitest'

import {
  apply,
  catalogDescription,
  catalogEntries,
  name,
  renderCatalogText,
} from '../presets/liangshen/tool-catalog.mjs'

type Listener = (first: any, second: any, third: any) => Promise<any>

interface Harness {
  listeners: Map<string, { listener: Listener, options: any }>
}

function register(config: Record<string, unknown> = {}): Harness {
  const listeners = new Map<string, { listener: Listener, options: any }>()
  const ctx = {
    on(event: string, callback: Listener, options?: any) {
      listeners.set(event, { listener: callback, options })
    },
  }
  apply(ctx, config)
  return { listeners }
}

function listener(harness: Harness, event: string): Listener {
  const entry = harness.listeners.get(event)
  expect(entry).toBeDefined()
  return entry!.listener
}

const TOOLS = [
  { name: 'bash', description: 'Run commands in a bash shell\n* State is persistent across command calls.' },
  { name: 'read', description: 'Read a UTF-8 text file and return line-numbered content.' },
]

/**
 * One live agent: the wire-catalog stash is keyed by the agent object, so a
 * test that spans several steps reuses the same one. `events` is the durable
 * log the catalog history is read back from, `surface` its visible positions.
 */
function agentOf(events: unknown[] = [], surface?: number[]) {
  const session: any = { snapshotEvents: () => events }
  if (surface !== undefined) session.surface = { nodes: surface }
  return { session }
}

async function assemble(harness: Harness, agent: unknown, tools: unknown[] = TOOLS) {
  return listener(harness, 'system-prompt/assemble')(
    undefined,
    { agent },
    async () => ({ sections: [], contexts: [], tools, variables: {} }),
  )
}

async function preStep(harness: Harness, agent: unknown, messages: unknown[] = [{ id: 'user', source: { kind: 'user' } }]) {
  return listener(harness, 'agent/pre-step')(
    { agent, messages, turn: 1, step: 1, signal: {} },
    async () => ({ kind: 'enter', messages }),
  )
}

function catalogOf(messages: unknown[]) {
  return messages.find((message: any) => message?.source?.plugin === name)
}

/** A durable catalog event carrying one injected message's data. */
function durableEvent(seq: number, message: any) {
  return { type: 'user/message', seq, data: message }
}

describe('liangshen-tool-catalog', () => {
  test('exports a diagnostic plugin name and injects the prompt registry', () => {
    expect(name).toBe('liangshen-tool-catalog')
  })

  test('registers both hooks outermost in their waterfalls', () => {
    const harness = register()
    expect(harness.listeners.get('system-prompt/assemble')?.options).toMatchObject({ prepend: true })
    expect(harness.listeners.get('agent/pre-step')?.options).toMatchObject({ prepend: true })
  })

  test('injects the wire catalog after the user message', async () => {
    const harness = register()
    const agent = agentOf()
    await assemble(harness, agent)
    const result = await preStep(harness, agent, [{ id: 'user', source: { kind: 'user' } }])
    expect(result.messages.map((message: any) => message.id)).toEqual(['user', expect.any(String)])
    const catalog = catalogOf(result.messages)
    expect(catalog.role).toBe('user')
    expect(catalog.content[0].text).toContain('The following tools are available in this session:')
    expect(catalog.content[0].text).toContain('- `bash`: Run commands in a bash shell * State is persistent across command calls.')
    expect(catalog.content[0].text).toContain('- `read`: Read a UTF-8 text file and return line-numbered content.')
  })

  test('marks the message with the minimal plugin source shape', async () => {
    const harness = register()
    const agent = agentOf()
    await assemble(harness, agent)
    const catalog = catalogOf((await preStep(harness, agent)).messages)
    // The durable validator whitelists `kind`, `plugin`, `form`, `sections`
    // and `summary` for a plugin source; anything else risks rejection.
    expect(catalog.source).toEqual({ kind: 'plugin', plugin: name })
    expect(typeof catalog.id).toBe('string')
    expect(catalog.id.length).toBeGreaterThan(0)
  })

  test('appends nothing when no assembly was observed', async () => {
    const result = await preStep(register(), agentOf())
    expect(result.messages).toHaveLength(1)
  })

  test('appends nothing for an empty catalog that was never published', async () => {
    const harness = register()
    const agent = agentOf()
    await assemble(harness, agent, [])
    const result = await preStep(harness, agent)
    expect(result.messages).toHaveLength(1)
  })

  test('does not republish while the published catalog is still visible', async () => {
    const harness = register()
    const agent = agentOf()
    await assemble(harness, agent)
    const first = await preStep(harness, agent)
    const events = [
      { type: 'user/message', seq: 1, data: { id: 'user', source: { kind: 'user' } } },
      durableEvent(2, catalogOf(first.messages)),
    ]
    const next = agentOf(events, [1, 2])
    await assemble(harness, next)
    const second = await preStep(harness, next)
    expect(second.messages).toHaveLength(1)
  })

  test('republishes when the wire catalog changed', async () => {
    const harness = register()
    const agent = agentOf()
    await assemble(harness, agent)
    const first = await preStep(harness, agent)
    const next = agentOf([durableEvent(2, catalogOf(first.messages))], [2])
    await assemble(harness, next, [...TOOLS, { name: 'edit', description: 'Edit one file.' }])
    const second = await preStep(harness, next)
    const update = catalogOf(second.messages)
    expect(update.content[0].text).toContain('- `edit`: Edit one file.')
    expect(update.content[0].text).toContain('replaces any earlier available-tools list')
  })

  test('republishes after a compaction shadows the published catalog', async () => {
    const harness = register()
    const agent = agentOf()
    await assemble(harness, agent)
    const first = await preStep(harness, agent)
    // The event survives in the log but is no longer on the visible surface.
    const compacted = agentOf([durableEvent(2, catalogOf(first.messages))], [1])
    await assemble(harness, compacted)
    const second = await preStep(harness, compacted)
    expect(catalogOf(second.messages)).toBeDefined()
  })

  test('reads the published state back through the legacy events array', async () => {
    const harness = register()
    const agent = agentOf()
    await assemble(harness, agent)
    const first = await preStep(harness, agent)
    const legacy: any = { session: { events: [durableEvent(2, catalogOf(first.messages))] } }
    await assemble(harness, legacy)
    const second = await preStep(harness, legacy)
    expect(second.messages).toHaveLength(1)
  })

  test('ignores an unusable catalog record instead of throwing', async () => {
    const harness = register()
    const agent = agentOf([
      { type: 'user/message', seq: 1, data: { id: 'x', role: 'user', source: { kind: 'plugin', plugin: name } } },
    ], [1])
    await assemble(harness, agent)
    const result = await preStep(harness, agent)
    expect(catalogOf(result.messages)).toBeDefined()
  })

  test('keeps an already-current catalog message in the batch', async () => {
    const harness = register()
    const agent = agentOf()
    await assemble(harness, agent)
    const first = await preStep(harness, agent)
    const catalog = catalogOf(first.messages)
    const second = await preStep(harness, agent, [{ id: 'user', source: { kind: 'user' } }, catalog])
    expect(second.messages).toHaveLength(2)
  })

  test('drops a batch catalog message that is already on the visible surface', async () => {
    const harness = register()
    const agent = agentOf()
    await assemble(harness, agent)
    const first = await preStep(harness, agent)
    const catalog = catalogOf(first.messages)
    const withHistory = agentOf([durableEvent(2, catalog)], [2])
    await assemble(harness, withHistory)
    const second = await preStep(harness, withHistory, [{ id: 'user', source: { kind: 'user' } }, catalog])
    expect(second.messages.map((message: any) => message.id)).toEqual(['user'])
  })

  test('reports an empty catalog that replaced a published one', async () => {
    const harness = register()
    const agent = agentOf()
    await assemble(harness, agent)
    const first = await preStep(harness, agent)
    const next = agentOf([durableEvent(2, catalogOf(first.messages))], [2])
    await assemble(harness, next, [])
    const second = await preStep(harness, next)
    const update = catalogOf(second.messages)
    expect(update.content[0].text).toContain('No tools are currently available in this session.')
  })

  test('leaves a rejected step decision untouched', async () => {
    const harness = register()
    const agent = agentOf()
    await assemble(harness, agent)
    const result = await listener(harness, 'agent/pre-step')(
      { agent, messages: [], turn: 1, step: 1, signal: {} },
      async () => ({ kind: 'reject' }),
    )
    expect(result).toEqual({ kind: 'reject' })
  })

  test('rejects an invalid description cap', () => {
    expect(() => register({ descriptionMaxLength: 0 })).toThrow(/descriptionMaxLength must be an integer >= 1/)
    expect(() => register({ descriptionMaxLength: 1.5 })).toThrow(/descriptionMaxLength must be an integer >= 1/)
  })

  test('catalogDescription collapses whitespace and truncates', () => {
    expect(catalogDescription('  a\n\n b  ', 20)).toBe('a b')
    expect(catalogDescription('abcdefghij', 7)).toBe('abcd...')
    expect(catalogDescription(undefined, 20)).toBe('')
  })

  test('catalogEntries keeps wire order and skips nameless tools', () => {
    const entries = catalogEntries([
      { name: 'b', description: 'second' },
      { description: 'nameless' },
      { name: 'a', description: 'first' },
    ], 200)
    expect(entries).toEqual([{ name: 'b', description: 'second' }, { name: 'a', description: 'first' }])
    expect(catalogEntries(undefined, 200)).toEqual([])
  })

  test('renderCatalogText frames a list and an empty catalog', () => {
    const list = renderCatalogText([{ name: 'read', description: 'Read a file.' }])
    expect(list).toContain('<available_tools>')
    expect(list).toContain('- `read`: Read a file.')
    expect(list).toContain("each tool's full parameter schema travels with its own tool definition")
    expect(renderCatalogText([])).toContain('No tools are currently available in this session.')
  })
})
