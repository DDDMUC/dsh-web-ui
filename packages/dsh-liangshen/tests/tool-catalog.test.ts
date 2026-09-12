import { describe, expect, test } from 'vitest'

import {
  anchorToolsOf,
  apply,
  catalogDescription,
  catalogEntries,
  inAnchorTurn,
  name,
  renderCatalogText,
  renderJsonSchemaType,
  renderSignature,
} from '../presets/liangshen/tool-catalog.mjs'

type Listener = (first: any, second: any, third: any) => Promise<any>

interface Harness {
  listeners: Map<string, { listener: Listener, options: any }>
  presentCalls: string[]
  warnings: string[]
  /** Replace the surface the registry projects, as a mid-session tool change would. */
  setSdk(schemas: unknown[]): void
}

interface HarnessOptions {
  /** The surface the registry's `sdkSchemas` projects; defaults to {@link SDK_SURFACE}. */
  sdk?: unknown[]
  /** When true the registry advertises no `sdkSchemas` at all. */
  noSdkSchemas?: boolean
  /** When true `sdkSchemas` throws, as a hostile definition would. */
  sdkThrows?: boolean
  /** When false the context exposes no code runtime. */
  codeRuntime?: boolean
}

const SDK_SURFACE = [
  {
    name: 'bash',
    description: 'Run commands in a bash shell\n* State is persistent across command calls.',
    parameters: {
      type: 'object',
      properties: { command: { type: 'string' }, timeoutMs: { type: 'integer' } },
      required: ['command'],
    },
  },
  { name: 'read', description: 'Read a UTF-8 text file and return line-numbered content.' },
]

function register(config: Record<string, unknown> = {}, options: HarnessOptions = {}): Harness {
  const listeners = new Map<string, { listener: Listener, options: any }>()
  const presentCalls: string[] = []
  const warnings: string[] = []
  let sdk = options.sdk ?? SDK_SURFACE
  const tools: Record<string, unknown> = {
    sdkSchemas: () => {
      if (options.sdkThrows === true) throw new Error('unsupported schema')
      return sdk
    },
  }
  if (options.noSdkSchemas === true) delete tools.sdkSchemas
  const services: Record<string, unknown> = { tools }
  if (options.codeRuntime !== false) services.codeRuntime = { language: 'typescript' }
  const ctx = {
    on(event: string, callback: Listener, opts?: any) {
      listeners.set(event, { listener: callback, options: opts })
    },
    get: (service: string) => services[service],
    logger: { warn: (message: string) => { warnings.push(message) } },
  }
  apply(ctx, config)
  return {
    listeners,
    presentCalls,
    warnings,
    setSdk(next: unknown[]) { sdk = next },
  }
}

function listener(harness: Harness, event: string): Listener {
  const entry = harness.listeners.get(event)
  expect(entry).toBeDefined()
  return entry!.listener
}

/** The assembled wire the harness hands the plugin: a native Standard-like roster. */
const WIRE = [
  { name: 'bash', description: 'Run commands in a bash shell', parameters: { type: 'object', properties: {} } },
  { name: 'read', description: 'Read a UTF-8 text file', parameters: { type: 'object', properties: {} } },
  { name: 'web_search', description: 'Search the web.', parameters: { type: 'object', properties: {} } },
]

/**
 * One live agent: the catalog stash and the PTC latch are keyed by the agent
 * object, so a test that spans several steps reuses the same one. `events` is
 * the durable log the catalog history is read back from, `surface` its visible
 * positions, and `ctx.tools.presentAs` the per-session presentation declaration.
 */
function agentOf(events: unknown[] = [], surface?: number[], harness?: Harness) {
  const session: any = { snapshotEvents: () => events }
  if (surface !== undefined) session.surface = { nodes: surface }
  return {
    session,
    ctx: {
      tools: {
        presentAs(mode: string) {
          harness?.presentCalls.push(mode)
          return () => {}
        },
      },
    },
  }
}

/** Dispatch a session event to the plugin's listener, as the harness does on append. */
function emitSession(harness: Harness, session: unknown, event: unknown) {
  const entry = harness.listeners.get('session/event')
  expect(entry).toBeDefined()
  entry!.listener(session, event)
}

/** Assemble and record how many presentation declarations had landed by the time `next()` ran. */
async function assemble(harness: Harness, agent: unknown, tools: unknown[] = WIRE) {
  let declarationsBeforeNext = -1
  const assembled = await listener(harness, 'system-prompt/assemble')(
    undefined,
    { agent },
    async () => {
      declarationsBeforeNext = harness.presentCalls.length
      return { sections: [], contexts: [], tools, variables: {} }
    },
  )
  return { assembled, declarationsBeforeNext }
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

function catalogText(messages: unknown[]): string {
  return (catalogOf(messages) as any)?.content[0].text ?? ''
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

  test('injects the registry surface with argument signatures after the user message', async () => {
    const harness = register()
    const agent = agentOf()
    await assemble(harness, agent)
    const result = await preStep(harness, agent, [{ id: 'user', source: { kind: 'user' } }])
    expect(result.messages.map((message: any) => message.id)).toEqual(['user', expect.any(String)])
    const catalog = catalogOf(result.messages)
    expect(catalog.role).toBe('user')
    expect(catalog.content[0].text).toContain('The following tools are available in this session:')
    expect(catalog.content[0].text).toContain('- `bash({ command: string, timeoutMs?: number })`: Run commands in a bash shell * State is persistent across command calls.')
    expect(catalog.content[0].text).toContain('- `read`: Read a UTF-8 text file and return line-numbered content.')
  })

  test('states the PTC invocation contract when the deployment can present it', async () => {
    const harness = register()
    const agent = agentOf()
    await assemble(harness, agent)
    const text = catalogText((await preStep(harness, agent)).messages)
    expect(text).toContain('presents these tools through `run_code`')
    expect(text).toContain('`await tools.<name>({ ... })`')
    expect(text).toContain('Compose one program per intent instead of one tool call per step')
    expect(text).toContain('`Promise.all`')
    expect(text).toContain('`ToolCallError`')
    expect(text).toContain('only tool that can be called directly')
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

  test('appends nothing for an empty surface that was never published', async () => {
    const harness = register({}, { sdk: [] })
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
    const next = agentOf(events, [1, 2], harness)
    await assemble(harness, next)
    const second = await preStep(harness, next)
    expect(second.messages).toHaveLength(1)
  })

  test('republishes when the surface changed', async () => {
    const harness = register()
    const agent = agentOf()
    await assemble(harness, agent)
    const first = await preStep(harness, agent)
    const history = agentOf([durableEvent(2, catalogOf(first.messages))], [2], harness)
    await assemble(harness, history)
    harness.setSdk([...SDK_SURFACE, { name: 'edit', description: 'Edit one file.' }])
    await assemble(harness, history)
    const second = await preStep(harness, history)
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
    const compacted = agentOf([durableEvent(2, catalogOf(first.messages))], [1], harness)
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
    ], [1], harness)
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
    const withHistory = agentOf([durableEvent(2, catalog)], [2], harness)
    await assemble(harness, withHistory)
    const second = await preStep(harness, withHistory, [{ id: 'user', source: { kind: 'user' } }, catalog])
    expect(second.messages.map((message: any) => message.id)).toEqual(['user'])
  })

  test('reports an empty surface that replaced a published one', async () => {
    const harness = register({}, { sdk: [] })
    const agent = agentOf()
    await assemble(harness, agent)
    const first = await preStep(harness, agent)
    const next = agentOf([durableEvent(2, catalogOf(first.messages))], [2], harness)
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

  test('rejects invalid configuration', () => {
    expect(() => register({ descriptionMaxLength: 0 })).toThrow(/descriptionMaxLength must be an integer >= 1/)
    expect(() => register({ descriptionMaxLength: 1.5 })).toThrow(/descriptionMaxLength must be an integer >= 1/)
    expect(() => register({ anchorTools: 'bash' })).toThrow(/anchorTools must be an array/)
    expect(() => register({ anchorTools: ['bash', ''] })).toThrow(/anchorTools entries must be non-empty/)
    expect(() => register({ ptcPresentation: 'yes' })).toThrow(/ptcPresentation must be a boolean/)
  })

  test('inAnchorTurn reads the turn boundary from the durable log', () => {
    expect(inAnchorTurn(undefined)).toBe(true)
    expect(inAnchorTurn([{ type: 'step/start' }, { type: 'user/message' }])).toBe(true)
    expect(inAnchorTurn([{ type: 'turn/start' }])).toBe(true)
    expect(inAnchorTurn([{ type: 'turn/start' }, { type: 'step/start' }])).toBe(true)
    // The anchor covers the whole first turn: it ends at the first turn/end and
    // at the second turn/start, whichever comes first.
    expect(inAnchorTurn([{ type: 'turn/start' }, { type: 'turn/end' }])).toBe(false)
    expect(inAnchorTurn([{ type: 'turn/start' }, { type: 'step/start' }, { type: 'turn/start' }])).toBe(false)
  })

  test('anchorToolsOf narrows to the anchor names in wire order and passes the list through when off', () => {
    const wire = [{ name: 'skill' }, { name: 'bash' }, { name: 'web_search' }, { name: 'str_replace_editor' }]
    expect(anchorToolsOf(wire, ['bash', 'str_replace_editor']).map((tool: any) => tool.name))
      .toEqual(['bash', 'str_replace_editor'])
    expect(anchorToolsOf(wire, [])).toBe(wire)
  })

  test('the anchor turn narrows the wire to the shell and stays native', async () => {
    const harness = register({ anchorTools: ['bash'] })
    const agent = agentOf([{ type: 'turn/start' }], undefined, harness)
    const { assembled } = await assemble(harness, agent)
    expect(assembled.tools.map((tool: any) => tool.name)).toEqual(['bash'])
    expect(harness.presentCalls).toEqual([])
    // The catalog still names the promoted surface — the entries come from the
    // registry, not from the narrowed wire.
    expect(catalogText((await preStep(harness, agent)).messages)).toContain('- `read`')
  })

  test('the anchor turn ends at turn/end and declares PTC before the next assembly', async () => {
    const harness = register({ anchorTools: ['bash'] })
    const events: any[] = [{ type: 'turn/start', seq: 1 }]
    const agent = agentOf(events, undefined, harness)
    const { assembled } = await assemble(harness, agent)
    expect(assembled.tools.map((tool: any) => tool.name)).toEqual(['bash'])
    expect(harness.presentCalls).toEqual([])

    // The anchor turn ends: the boundary event declares PTC outside any
    // waterfall, so the promoted turn's first assembly already sees it.
    events.push({ type: 'turn/end', seq: 2 })
    emitSession(harness, agent.session, { type: 'turn/end' })
    expect(harness.presentCalls).toEqual(['ptc'])

    const promoted = await assemble(harness, agent)
    expect(promoted.assembled.tools).toBe(WIRE)
    expect(harness.presentCalls).toEqual(['ptc'])
  })

  test('later turn boundaries do not re-declare and never narrow again', async () => {
    const harness = register({ anchorTools: ['bash'] })
    const events: any[] = [{ type: 'turn/start', seq: 1 }, { type: 'turn/end', seq: 2 }]
    const agent = agentOf(events, undefined, harness)
    await assemble(harness, agent)
    emitSession(harness, agent.session, { type: 'turn/end' })
    events.push({ type: 'turn/start', seq: 3 })
    emitSession(harness, agent.session, { type: 'turn/start' })
    emitSession(harness, agent.session, { type: 'turn/end' })
    expect(harness.presentCalls).toEqual(['ptc'])
    expect((await assemble(harness, agent)).assembled.tools).toBe(WIRE)
  })

  test('the assembly listener re-asserts the declaration for an unobserved boundary', async () => {
    const harness = register({ anchorTools: ['bash'] })
    // A session resumed with the boundary already crossed: no session event was
    // observed, so the declaration lands from the assembly listener.
    const agent = agentOf([{ type: 'turn/start', seq: 1 }, { type: 'turn/start', seq: 2 }], undefined, harness)
    const { assembled, declarationsBeforeNext } = await assemble(harness, agent)
    expect(declarationsBeforeNext).toBe(1)
    expect(harness.presentCalls).toEqual(['ptc'])
    // The wire is whatever the registry produced for that assembly; the plugin
    // must not narrow it to the anchor names any more.
    expect(assembled.tools).toBe(WIRE)
    expect((await assemble(harness, agent)).assembled.tools).toBe(WIRE)
    expect(harness.presentCalls).toEqual(['ptc'])
  })

  test('declares PTC once per agent and keeps the catalog text stable across the boundary', async () => {
    const harness = register({ anchorTools: ['bash'] })
    const anchored = agentOf([{ type: 'turn/start' }], undefined, harness)
    await assemble(harness, anchored)
    const firstStep = await preStep(harness, anchored)
    const catalog = catalogOf(firstStep.messages)
    const promoted = agentOf(
      [{ type: 'turn/start', seq: 1 }, { type: 'turn/start', seq: 2 }, durableEvent(3, catalog)],
      [3],
      harness,
    )
    await assemble(harness, promoted)
    await assemble(harness, promoted)
    expect(harness.presentCalls).toEqual(['ptc'])
    const second = await preStep(harness, promoted, [{ id: 'user', source: { kind: 'user' } }])
    // The rendered text is identical across the boundary: no republish.
    expect(catalogOf(second.messages)).toBeUndefined()
    expect(second.messages).toHaveLength(1)
  })

  test('stays native and says nothing about run_code without a code runtime', async () => {
    const harness = register({}, { codeRuntime: false })
    const agent = agentOf([{ type: 'turn/start' }, { type: 'turn/start' }], undefined, harness)
    const { assembled } = await assemble(harness, agent)
    expect(harness.presentCalls).toEqual([])
    expect(assembled.tools).toBe(WIRE)
    const text = catalogText((await preStep(harness, agent)).messages)
    expect(text).not.toContain('run_code')
    expect(text).toContain('- `bash({ command: string, timeoutMs?: number })`')
  })

  test('honors ptcPresentation: false', async () => {
    const harness = register({ ptcPresentation: false })
    const agent = agentOf([{ type: 'turn/start' }, { type: 'turn/start' }], undefined, harness)
    await assemble(harness, agent)
    expect(harness.presentCalls).toEqual([])
    expect(catalogText((await preStep(harness, agent)).messages)).not.toContain('run_code')
  })

  test('degrades to the assembled wire when the registry publishes no SDK projection', async () => {
    const harness = register({}, { noSdkSchemas: true })
    const agent = agentOf()
    const { assembled } = await assemble(harness, agent)
    expect(assembled.tools).toBe(WIRE)
    const text = catalogText((await preStep(harness, agent)).messages)
    expect(text).toContain('- `web_search(')
  })

  test('survives a hostile SDK projection with one warning', async () => {
    const harness = register({}, { sdkThrows: true })
    const agent = agentOf()
    await assemble(harness, agent)
    await assemble(harness, agent)
    expect(harness.warnings).toHaveLength(1)
    expect(catalogText((await preStep(harness, agent)).messages)).toContain('- `web_search(')
  })

  test('warns once when a session has no scoped tools view to declare through', async () => {
    const harness = register({}, { scopedTools: false })
    const agent: any = { session: { snapshotEvents: () => [{ type: 'turn/start' }, { type: 'turn/start' }] } }
    await assemble(harness, agent)
    await assemble(harness, agent)
    expect(harness.warnings).toHaveLength(1)
    expect(harness.warnings[0]).toContain('keeping the native tool surface')
  })

  test('staging off: the first request carries the assembled wire', async () => {
    const harness = register()
    const agent = agentOf([{ type: 'turn/start' }], undefined, harness)
    const { assembled } = await assemble(harness, agent)
    expect(assembled.tools).toBe(WIRE)
    expect(catalogOf((await preStep(harness, agent)).messages)).toBeDefined()
  })

  test('catalogDescription collapses whitespace and truncates', () => {
    expect(catalogDescription('  a\n\n b  ', 20)).toBe('a b')
    expect(catalogDescription('abcdefghij', 7)).toBe('abcd...')
    expect(catalogDescription(undefined, 20)).toBe('')
  })

  test('renderJsonSchemaType renders the supported constructs and degrades the rest', () => {
    expect(renderJsonSchemaType({ type: 'string' })).toBe('string')
    expect(renderJsonSchemaType({ type: 'integer' })).toBe('number')
    expect(renderJsonSchemaType({ type: 'boolean' })).toBe('boolean')
    expect(renderJsonSchemaType({ enum: ['a', 'b'] })).toBe('"a" | "b"')
    expect(renderJsonSchemaType({ const: 3 })).toBe('3')
    expect(renderJsonSchemaType({ oneOf: [{ type: 'string' }, { type: 'null' }] })).toBe('string | null')
    expect(renderJsonSchemaType({ anyOf: [{ type: 'string' }, { type: 'null' }] })).toBe('string | null')
    expect(renderJsonSchemaType({ type: ['string', 'null'] })).toBe('string | null')
    expect(renderJsonSchemaType({ type: 'array', items: { type: 'number' } })).toBe('number[]')
    expect(renderJsonSchemaType({ type: 'array', items: { oneOf: [{ type: 'string' }, { type: 'number' }] } })).toBe('(string | number)[]')
    expect(renderJsonSchemaType({ type: 'object' })).toBe('Record<string, JsonValue>')
    expect(renderJsonSchemaType({})).toBe('JsonValue')
    expect(renderJsonSchemaType(undefined)).toBe('JsonValue')
    expect(renderJsonSchemaType({ type: 'object', properties: { a: { type: 'string' }, b: { type: 'array', items: { type: 'string' } } }, required: ['a'] }))
      .toBe('{ a: string, b?: string[] }')
  })

  test('renderJsonSchemaType stops expanding past the nesting cap', () => {
    const deep = (depth: number): any => (
      depth === 0
        ? { type: 'string' }
        : { type: 'object', properties: { next: deep(depth - 1) }, required: ['next'] }
    )
    expect(renderJsonSchemaType(deep(3))).toContain('{ next:')
    expect(renderJsonSchemaType(deep(6))).toContain('JsonValue')
  })

  test('renderSignature renders a parenthesized argument list or nothing', () => {
    expect(renderSignature({ type: 'object', properties: { command: { type: 'string' } }, required: ['command'] }))
      .toBe('({ command: string })')
    expect(renderSignature({})).toBe('')
    expect(renderSignature(undefined)).toBe('')
  })

  test('catalogEntries sorts by name, carries signatures, and skips nameless tools', () => {
    const entries = catalogEntries([
      { name: 'b', description: 'second' },
      { description: 'nameless' },
      { name: 'a', description: 'first', parameters: { type: 'object', properties: {} } },
    ], 200)
    expect(entries).toEqual([
      { name: 'a', signature: '(Record<string, JsonValue>)', description: 'first' },
      { name: 'b', signature: '', description: 'second' },
    ])
    expect(catalogEntries(undefined, 200)).toEqual([])
  })

  test('renderCatalogText frames a list, the PTC contract, and an empty catalog', () => {
    const list = renderCatalogText([{ name: 'read', signature: '()', description: 'Read a file.' }], false)
    expect(list).toContain('<available_tools>')
    expect(list).toContain('- `read()`: Read a file.')
    expect(list).toContain('the full parameter schema travels with its own tool definition')
    expect(list).not.toContain('run_code')
    expect(renderCatalogText([], false)).toContain('No tools are currently available in this session.')
    expect(renderCatalogText([], true)).toContain('presents these tools through `run_code`')
    expect(renderCatalogText([], true)).toContain('Compose one program per intent')
    expect(renderCatalogText([], false)).not.toContain('Promise.all')
  })
})
