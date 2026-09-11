import { describe, expect, test } from 'vitest'

import { apply, extractInstructionPaths, name } from '../presets/liangshen/minimal-prompt.mjs'

type Listener = (first: any, second: any, third: any) => Promise<any>

interface Harness {
  listeners: Map<string, { listener: Listener, options: any }>
  warns: string[]
}

function register(config: Record<string, unknown> = {}): Harness {
  const listeners = new Map<string, { listener: Listener, options: any }>()
  const warns: string[] = []
  const ctx = {
    on(event: string, callback: Listener, options?: any) {
      listeners.set(event, { listener: callback, options })
    },
    logger: { warn: (message: string) => { warns.push(message) } },
  }
  apply(ctx, config)
  return { listeners, warns }
}

function listener(harness: Harness, event: string): Listener {
  const entry = harness.listeners.get(event)
  expect(entry).toBeDefined()
  return entry!.listener
}

/** One stable agent/session identity, so per-session state survives a call. */
function agentOf() {
  return { session: { header: {} } }
}

const PERSONA = { name: 'deployment:persona-prefix', text: 'You are a helpful software engineer assistant.' }
const PLAN = { name: 'plan:policy', text: 'You are in plan mode.' }

const FULL_SECTIONS = [
  { name: 'harness:identity', text: 'You are an AI agent powered by DeepSeek Harness.' },
  PERSONA,
  { name: 'tool:bash', text: 'Check the [exit code: N] marker on every bash result.' },
  PLAN,
  { name: 'web:surface', text: 'You are interacting with the user through the DSH Web GUI.' },
]

async function assemble(
  harness: Harness,
  sections: unknown[] = FULL_SECTIONS,
  contexts: unknown[] = [{ name: 'sandbox:policy', text: 'Current DSH file policy: workspace-write.' }],
  agent: unknown = agentOf(),
) {
  return listener(harness, 'system-prompt/assemble')(
    undefined,
    { agent },
    async () => ({ sections, contexts, tools: [], variables: {} }),
  )
}

async function preStep(
  harness: Harness,
  agent: unknown,
  messages: unknown[],
  kind = 'enter',
) {
  return listener(harness, 'agent/pre-step')(
    { agent, messages, turn: 1, step: 1, signal: {} },
    async () => ({ kind, messages }),
  )
}

function instructionsMessage(id: string, paths: string[]) {
  return {
    id,
    role: 'user',
    content: [{ type: 'text', text: paths.map(path => `Instructions from: ${path}`).join('\n') }],
    source: { kind: 'agent-instructions' },
  }
}

describe('liangshen-minimal-prompt', () => {
  test('exports a diagnostic plugin name and injects the prompt registry', () => {
    expect(name).toBe('liangshen-minimal-prompt')
  })

  test('registers both hooks outermost in their waterfalls', () => {
    const harness = register()
    expect(harness.listeners.get('system-prompt/assemble')?.options).toMatchObject({ prepend: true })
    expect(harness.listeners.get('agent/pre-step')?.options).toMatchObject({ prepend: true })
  })

  test('narrows the assembled prompt to the persona and the plan policy', async () => {
    const result = await assemble(register())
    expect(result.sections.map((section: any) => section.name)).toEqual(['deployment:persona-prefix', 'plan:policy'])
    expect(result.sections[0].text).toBe(PERSONA.text)
  })

  test('leaves runtime contexts and tools untouched', async () => {
    const contexts = [{ name: 'sandbox:policy', text: 'Current DSH file policy: workspace-write.' }]
    const result = await assemble(register(), FULL_SECTIONS, contexts)
    expect(result.contexts).toEqual(contexts)
    expect(result.tools).toEqual([])
  })

  test('accepts the legacy persona section names', async () => {
    const legacy = [
      { name: 'persona', text: 'You are a helpful software engineer assistant.' },
      { name: 'harness:identity', text: 'identity' },
    ]
    const result = await assemble(register(), legacy)
    expect(result.sections.map((section: any) => section.name)).toEqual(['persona'])
  })

  test('drops the plan policy when keepPlanPolicy is false', async () => {
    const result = await assemble(register({ keepPlanPolicy: false }))
    expect(result.sections.map((section: any) => section.name)).toEqual(['deployment:persona-prefix'])
  })

  test('keeps the assembled prompt and warns once when no persona section exists', async () => {
    const harness = register()
    const withoutPersona = [{ name: 'harness:identity', text: 'identity' }]
    const result = await assemble(harness, withoutPersona)
    expect(result.sections).toEqual(withoutPersona)
    await assemble(harness, withoutPersona)
    expect(harness.warns).toHaveLength(1)
    expect(harness.warns[0]).toContain('no section matched')
  })

  test('rejects a non-boolean switch', () => {
    expect(() => register({ instructionHint: 'yes' })).toThrow(/instructionHint must be a boolean/)
    expect(() => register({ keepPlanPolicy: 1 })).toThrow(/keepPlanPolicy must be a boolean/)
  })

  test('appends the session workspace directory to the persona', async () => {
    const agent = { session: { header: { cwd: '/Users/zcl/code/dsh-web' } } }
    const result = await assemble(register(), FULL_SECTIONS, undefined, agent)
    expect(result.sections[0].text)
      .toBe('You are a helpful software engineer assistant.\n\nYour working directory is /Users/zcl/code/dsh-web.')
    // The plan policy is not orientation: it stays verbatim.
    expect(result.sections.find((section: any) => section.name === 'plan:policy').text).toBe(PLAN.text)
  })

  test('accepts the legacy persona name for the workspace line', async () => {
    const agent = { session: { header: { cwd: '/w' } } }
    const legacy = [{ name: 'persona', text: 'You are a helpful software engineer assistant.' }]
    const result = await assemble(register(), legacy, undefined, agent)
    expect(result.sections[0].text).toContain('Your working directory is /w.')
  })

  test('does not duplicate a workspace line the persona already carries', async () => {
    const agent = { session: { header: { cwd: '/w' } } }
    const carried = [{
      name: 'deployment:persona-prefix',
      text: 'You are a helpful software engineer assistant.\n\nYour working directory is /w.',
    }]
    const result = await assemble(register(), carried, undefined, agent)
    expect(result.sections[0].text.match(/Your working directory is \/w\./g)).toHaveLength(1)
  })

  test('keeps the bare persona when the session reports no cwd', async () => {
    const agent = { session: { header: {} } }
    const result = await assemble(register(), FULL_SECTIONS, undefined, agent)
    expect(result.sections[0].text).toBe(PERSONA.text)
  })

  test('replaces the first agent-instructions injection with a plugin hint', async () => {
    const message = instructionsMessage('instructions-1', ['/repo/AGENTS.md', '/repo/docs/AGENTS.md'])
    const result = await preStep(register(), agentOf(), [message])
    expect(result.kind).toBe('enter')
    expect(result.messages).toHaveLength(1)
    const hint = result.messages[0]
    expect(hint.id).toBe('instructions-1')
    expect(hint.role).toBe('user')
    expect(hint.source).toEqual({ kind: 'plugin', plugin: 'liangshen-minimal-prompt' })
    expect(hint.content[0].text).toContain('/repo/AGENTS.md, /repo/docs/AGENTS.md')
    expect(hint.content[0].text).toContain('not task instructions')
  })

  test('mints a message id when the instructions message carries none', async () => {
    const message = { content: [{ type: 'text', text: 'Instructions from: /repo/AGENTS.md' }], source: { kind: 'agent-instructions' } }
    const result = await preStep(register(), agentOf(), [message])
    expect(typeof result.messages[0].id).toBe('string')
    expect(result.messages[0].id.length).toBeGreaterThan(0)
  })

  test('drops later agent-instructions injections and keeps other messages', async () => {
    const harness = register()
    const agent = agentOf()
    const first = await preStep(harness, agent, [instructionsMessage('a', ['/repo/AGENTS.md'])])
    expect(first.messages).toHaveLength(1)
    const second = await preStep(harness, agent, [
      { id: 'user', source: { kind: 'user' } },
      instructionsMessage('b', ['/repo/AGENTS.md']),
    ])
    expect(second.messages.map((message: any) => message.id)).toEqual(['user'])
  })

  test('keeps an agent-instructions injection that names no reference file', async () => {
    const message = { id: 'a', content: [{ type: 'text', text: 'no paths here' }], source: { kind: 'agent-instructions' } }
    const result = await preStep(register(), agentOf(), [message])
    expect(result.messages).toEqual([message])
  })

  test('passes every message through when instructionHint is false', async () => {
    const message = instructionsMessage('a', ['/repo/AGENTS.md'])
    const result = await preStep(register({ instructionHint: false }), agentOf(), [message])
    expect(result.messages).toEqual([message])
  })

  test('hints again after a compaction', async () => {
    const harness = register()
    const agent = agentOf()
    await preStep(harness, agent, [instructionsMessage('a', ['/repo/AGENTS.md'])])
    const second = await preStep(harness, agent, [instructionsMessage('b', ['/repo/AGENTS.md'])])
    expect(second.messages).toHaveLength(0)
    await listener(harness, 'session/event')(agent.session, { type: 'compaction/end' }, undefined)
    const third = await preStep(harness, agent, [instructionsMessage('c', ['/repo/AGENTS.md'])])
    expect(third.messages).toHaveLength(1)
    expect(third.messages[0].id).toBe('c')
  })

  test('leaves a rejected step decision untouched', async () => {
    const message = instructionsMessage('a', ['/repo/AGENTS.md'])
    const result = await preStep(register(), agentOf(), [message], 'reject')
    expect(result).toEqual({ kind: 'reject', messages: [message] })
  })

  test('extractInstructionPaths deduplicates in first-seen order', () => {
    const message = {
      content: [
        { type: 'text', text: 'Additional Instructions from: /b.md\nInstructions from: /a.md' },
        { type: 'text', text: 'Instructions from: /b.md' },
        { type: 'reasoning', text: 'Instructions from: /ignored.md' },
      ],
    }
    expect(extractInstructionPaths(message)).toEqual(['/b.md', '/a.md'])
    expect(extractInstructionPaths({})).toEqual([])
  })
})
