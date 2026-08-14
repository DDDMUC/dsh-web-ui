import { describe, expect, test } from 'vitest'

import { apply, name } from '../presets/liangshen/tool-bootstrap.mjs'

const config = {
  commonTools: ['read'],
  shellTools: ['bash', 'pwsh'],
}

type Listener = (payload: any, next: () => Promise<any>) => Promise<any>

function register(customConfig: Record<string, unknown> = {}): Map<string, { listener: Listener, options: any }> {
  const listeners = new Map<string, { listener: Listener, options: any }>()
  const ctx = {
    on(event: string, callback: Listener, options?: any) {
      listeners.set(event, { listener: callback, options })
    },
  }
  apply(ctx, { ...config, ...customConfig })
  return listeners
}

function listener(listeners: Map<string, { listener: Listener, options: any }>, event: string): Listener {
  const entry = listeners.get(event)
  expect(entry).toBeDefined()
  return entry!.listener
}

function session(events: unknown[] = []) {
  return { events }
}

function agentOf(events: unknown[] = []) {
  return { session: session(events) }
}

async function assemble(
  listener: Listener,
  events: unknown[],
  tools: unknown[],
  contexts: unknown[] = [{ name: 'sandbox:policy', text: 'Current DSH file policy: workspace-write.' }],
) {
  return listener(
    undefined,
    { agent: agentOf(events) },
    async () => ({ system: 'minimal persona', tools, contexts }),
  )
}

async function preStep(
  listener: Listener,
  events: unknown[],
  messages: unknown[],
  kind = 'enter',
) {
  return listener(
    { agent: agentOf(events), messages, turn: 1, step: 1, signal: {} },
    async () => ({ kind, messages }),
  )
}

function message(kind: string | undefined, id: string) {
  return { id, source: kind === undefined ? undefined : { kind } }
}

describe('anchored-tool-bootstrap', () => {
  test('exports a diagnostic plugin name', () => {
    expect(name).toBe('anchored-tool-bootstrap')
  })

  test('registers both quarantines outermost in their waterfalls', () => {
    const listeners = register()
    expect(listeners.get('system-prompt/assemble')?.options).toMatchObject({ prepend: true })
    expect(listeners.get('agent/pre-step')?.options).toMatchObject({ prepend: true })
  })

  test('first request exposes one platform shell and read and empties contexts', async () => {
    const result = await assemble(listener(register(), 'system-prompt/assemble'), [], [
      { name: 'pwsh' },
      { name: 'read' },
      { name: 'edit' },
    ])
    expect(result.tools.map((tool: any) => tool.name)).toEqual(['pwsh', 'read'])
    expect(result.contexts).toEqual([])
  })

  test('first request keeps its empty contexts even when none were assembled', async () => {
    const assembleListener = listener(register(), 'system-prompt/assemble')

    const result = await assembleListener(
      undefined,
      { agent: agentOf([]) },
      async () => ({ system: 'minimal persona', tools: [{ name: 'bash' }, { name: 'read' }] }),
    )
    expect(result.contexts).toEqual([])
  })

  test('a durable tool call promotes the complete catalog and restores contexts', async () => {
    const tools = [{ name: 'pwsh' }, { name: 'read' }, { name: 'edit' }, { name: 'grep' }]
    const contexts = [{ name: 'sandbox:policy', text: 'Current DSH file policy: workspace-write.' }]
    const events = [{ type: 'tool/call', data: { name: 'read' } }]
    const result = await assemble(listener(register(), 'system-prompt/assemble'), events, tools, contexts)
    expect(result.tools).toEqual(tools)
    expect(result.contexts).toEqual(contexts)
  })

  test('sessions derive promotion independently from their own events', async () => {
    const assembleListener = listener(register(), 'system-prompt/assemble')
    const tools = [{ name: 'bash' }, { name: 'read' }, { name: 'write' }]

    const promoted = await assemble(assembleListener, [{ type: 'tool/call' }], tools)
    const fresh = await assemble(assembleListener, [], tools)
    expect(promoted.tools).toEqual(tools)
    expect(fresh.tools.map((tool: any) => tool.name)).toEqual(['bash', 'read'])
  })

  test('phase 1 pre-step keeps only direct user messages', async () => {
    const messages = [
      message('user', 'user'),
      message('agent-instructions', 'instructions'),
      message('skill-catalog', 'skills'),
      message('plugin', 'runtime'),
      message(undefined, 'seed'),
    ]
    const result = await preStep(listener(register(), 'agent/pre-step'), [], messages)
    expect(result.kind).toBe('enter')
    expect(result.messages.map((entry: any) => entry.id)).toEqual(['user', 'seed'])
  })

  test('phase 1 pre-step leaves rejected decisions untouched', async () => {
    const messages = [message('user', 'user'), message('agent-instructions', 'instructions')]
    const result = await preStep(listener(register(), 'agent/pre-step'), [], messages, 'reject')
    expect(result.kind).toBe('reject')
    expect(result.messages).toEqual(messages)
  })

  test('a promoted pre-step lets injected messages through', async () => {
    const messages = [message('user', 'user'), message('agent-instructions', 'instructions')]
    const result = await preStep(listener(register(), 'agent/pre-step'), [{ type: 'tool/call' }], messages)
    expect(result.messages).toEqual(messages)
  })

  test('messageSources config narrows the phase-1 allowlist', async () => {
    const preStepListener = listener(register({ messageSources: ['user', 'agent-instructions'] }), 'agent/pre-step')
    const messages = [
      message('user', 'user'),
      message('agent-instructions', 'instructions'),
      message('skill-catalog', 'skills'),
    ]
    const result = await preStep(preStepListener, [], messages)
    expect(result.messages.map((entry: any) => entry.id)).toEqual(['user', 'instructions'])
  })

  test('misconfigured bootstrap catalogs fail loudly', async () => {
    await expect(assemble(listener(register(), 'system-prompt/assemble'), [], [{ name: 'read' }, { name: 'edit' }])).rejects.toThrow(
      /expected exactly one bootstrap shell/,
    )
  })
})
