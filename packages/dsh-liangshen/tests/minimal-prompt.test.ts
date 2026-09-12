import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  apply,
  extractInstructionPaths,
  loadInstructionText,
  name,
  renderInstructionSection,
  WORKSPACE_INSTRUCTIONS_SECTION_NAME,
} from '../presets/liangshen/minimal-prompt.mjs'

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

/**
 * Instruction discovery reads the real filesystem, so every test runs against
 * a scratch `$DSH_HOME`; project trees are scratch dirs with a `.git` marker.
 */
let homeDir: string
let savedHomeEnv: string | undefined
const scratchDirs: string[] = []

beforeEach(() => {
  homeDir = mkdtempSync(join(tmpdir(), 'liangshen-home-'))
  scratchDirs.push(homeDir)
  savedHomeEnv = process.env.DSH_HOME
  process.env.DSH_HOME = homeDir
})

afterEach(() => {
  if (savedHomeEnv === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = savedHomeEnv
  for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A scratch project directory with a `.git` marker and optional files. */
function project(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'liangshen-project-'))
  scratchDirs.push(dir)
  writeFileSync(join(dir, '.git'), '')
  for (const [name_, content] of Object.entries(files)) {
    mkdirSync(join(dir, name_, '..'), { recursive: true })
    writeFileSync(join(dir, name_), content)
  }
  return dir
}

function agentAt(cwd: string) {
  return { session: { header: { cwd } } }
}

function writeHome(relativePath: string, content: string) {
  mkdirSync(join(homeDir, relativePath, '..'), { recursive: true })
  writeFileSync(join(homeDir, relativePath), content)
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

  test('rejects an invalid switch', () => {
    expect(() => register({ instructionSource: 'yes' })).toThrow(/instructionSource must be one of/)
    expect(() => register({ instructionMaxBytes: 0 })).toThrow(/instructionMaxBytes must be a positive/)
    expect(() => register({ instructionMaxBytes: 'big' })).toThrow(/instructionMaxBytes must be a positive/)
    expect(() => register({ keepPlanPolicy: 1 })).toThrow(/keepPlanPolicy must be a boolean/)
  })

  test('appends the session workspace directory to the persona', async () => {
    const cwd = project()
    const result = await assemble(register(), FULL_SECTIONS, undefined, agentAt(cwd))
    expect(result.sections[0].text)
      .toBe(`You are a helpful software engineer assistant.\n\nYour working directory is ${cwd}.`)
    // The plan policy is not orientation: it stays verbatim.
    expect(result.sections.find((section: any) => section.name === 'plan:policy').text).toBe(PLAN.text)
  })

  test('accepts the legacy persona name for the workspace line', async () => {
    const agent = agentAt(project())
    const legacy = [{ name: 'persona', text: 'You are a helpful software engineer assistant.' }]
    const result = await assemble(register(), legacy, undefined, agent)
    expect(result.sections[0].text).toContain(`Your working directory is ${agent.session.header.cwd}.`)
  })

  test('does not duplicate a workspace line the persona already carries', async () => {
    const cwd = project()
    const agent = agentAt(cwd)
    const carried = [{
      name: 'deployment:persona-prefix',
      text: `You are a helpful software engineer assistant.\n\nYour working directory is ${cwd}.`,
    }]
    const result = await assemble(register(), carried, undefined, agent)
    const line = `Your working directory is ${cwd}.`
    expect(result.sections[0].text.split(line).length - 1).toBe(1)
  })

  test('keeps the bare persona when the session reports no cwd', async () => {
    const agent = { session: { header: {} } }
    const result = await assemble(register(), FULL_SECTIONS, undefined, agent)
    expect(result.sections[0].text).toBe(PERSONA.text)
  })

  test('appends the workspace-instructions section after the stable prefix', async () => {
    writeHome('AGENTS.md', 'user-global rule')
    const cwd = project({ 'AGENTS.md': 'project rule', 'docs/AGENTS.md': 'nested rule' })
    const result = await assemble(register(), FULL_SECTIONS, undefined, agentAt(cwd))
    expect(result.sections.map((section: any) => section.name)).toEqual([
      'deployment:persona-prefix',
      'plan:policy',
      WORKSPACE_INSTRUCTIONS_SECTION_NAME,
    ])
    expect(result.sections[2].text).toBe('{{workspace_instructions}}')
    const text = result.variables.workspace_instructions as string
    // Project paths display relative to the project root, as the harness renders them.
    expect(text).toContain('Instructions from: $DSH_HOME/AGENTS.md')
    expect(text).toContain('user-global rule')
    expect(text).toContain('Instructions from: AGENTS.md')
    expect(text).toContain('project rule')
    // Broadest first: the user-global block precedes the project block.
    expect(text.indexOf('user-global rule')).toBeLessThan(text.indexOf('project rule'))
    // The baseline chain is the root-to-cwd ancestors only: a descendant
    // instruction file (the harness's dynamic reconciliation territory) is
    // not part of the section.
    expect(text).not.toContain('nested rule')
  })

  test('renders the appended section through the harness renderer verbatim', async () => {
    writeHome('AGENTS.md', 'template example: {{evil}} and {{also_evil}}')
    const cwd = project()
    const result = await assemble(register(), FULL_SECTIONS, undefined, agentAt(cwd))
    const rendered = renderPrompt({ sections: result.sections, variables: result.variables })
    expect(rendered).toContain('template example: {{evil}} and {{also_evil}}')
    expect(rendered).toContain('Your working directory is')
  })

  test('includes CLAUDE.md candidates and local overlays, deduped per directory', async () => {
    const cwd = project({
      'AGENTS.md': 'project rule',
      'CLAUDE.md': 'project rule',
      'AGENTS.local.md': 'local override',
    })
    const result = await assemble(register(), FULL_SECTIONS, undefined, agentAt(cwd))
    const text = result.variables.workspace_instructions as string
    expect(text).toContain('AGENTS.local.md')
    expect(text.match(/project rule/g)).toHaveLength(1)
  })

  test('sends no instruction section when no cwd, no file, or empty budget result', async () => {
    const harness = register()
    const bare = await assemble(harness, FULL_SECTIONS, undefined, agentAt(project()))
    expect(bare.sections.map((section: any) => section.name)).not.toContain(WORKSPACE_INSTRUCTIONS_SECTION_NAME)
    const noCwd = await assemble(harness)
    expect(noCwd.sections.map((section: any) => section.name)).toEqual(['deployment:persona-prefix', 'plan:policy'])
  })

  test('keeps reading per assembly, so file edits propagate without state', async () => {
    const cwd = project({ 'AGENTS.md': 'first rule' })
    const harness = register()
    const first = await assemble(harness, FULL_SECTIONS, undefined, agentAt(cwd))
    expect(first.variables.workspace_instructions).toContain('first rule')
    writeFileSync(join(cwd, 'AGENTS.md'), 'second rule')
    const second = await assemble(harness, FULL_SECTIONS, undefined, agentAt(cwd))
    expect(second.variables.workspace_instructions).toContain('second rule')
  })

  test('omits broadest files first when over budget, keeping the most specific', async () => {
    writeHome('AGENTS.md', 'home rule that is reasonably long '.repeat(8))
    const cwd = project({ 'AGENTS.md': 'project rule' })
    const result = await assemble(register({ instructionMaxBytes: 600 }), FULL_SECTIONS, undefined, agentAt(cwd))
    const text = result.variables.workspace_instructions as string
    expect(text).toContain('omitted $DSH_HOME/AGENTS.md')
    expect(text).toContain('project rule')
    expect(text).not.toContain('home rule')
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(600)
  })

  test('truncates the most specific file last, at a UTF-8 boundary', async () => {
    writeHome('AGENTS.md', 'x'.repeat(2000))
    const result = await assemble(register({ instructionMaxBytes: 800 }), FULL_SECTIONS, undefined, agentAt(project()))
    const text = result.variables.workspace_instructions as string
    expect(text).toContain('truncated $DSH_HOME/AGENTS.md from 2000 to')
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(800)
  })

  test('pure renderer covers the degenerate budgets', () => {
    const files = [{ displayPath: 'AGENTS.md', content: 'rule' }]
    expect(renderInstructionSection([], 100)).toBeUndefined()
    expect(renderInstructionSection(files, 0)).toBeUndefined()
    expect(renderInstructionSection(files, -1)).toBeUndefined()
    expect(renderInstructionSection(files, Number.POSITIVE_INFINITY)).toBeUndefined()
  })

  test('degrades to the bare prompt when the cwd cannot be probed', async () => {
    const harness = register()
    // A cwd whose stat probes fail (a path component is a plain file)
    // contributes no instruction section instead of failing the request.
    const file = join(homeDir, 'blocker')
    writeFileSync(file, '')
    const agent = agentAt(join(file, 'nested', 'deep'))
    const result = await assemble(harness, FULL_SECTIONS, undefined, agent)
    expect(result.sections.map((section: any) => section.name)).toEqual(['deployment:persona-prefix', 'plan:policy'])
  })

  test('loadInstructionText handles a missing cwd and the default budget', async () => {
    expect(await loadInstructionText(undefined)).toBeUndefined()
    expect(await loadInstructionText('')).toBeUndefined()
    writeHome('AGENTS.md', 'home rule')
    expect(await loadInstructionText(project())).toContain('home rule')
  })

  test('drops every agent-instructions injection in the default mode', async () => {
    const harness = register()
    const agent = agentOf()
    const first = await preStep(harness, agent, [
      { id: 'user', source: { kind: 'user' } },
      instructionsMessage('a', ['/repo/AGENTS.md']),
    ])
    expect(first.messages.map((message: any) => message.id)).toEqual(['user'])
    // No per-session state: later injections are dropped too, with no hint.
    const second = await preStep(harness, agent, [instructionsMessage('b', ['/repo/AGENTS.md'])])
    expect(second.messages).toEqual([])
  })

  test('does not append an instruction section in hint mode', async () => {
    writeHome('AGENTS.md', 'home rule')
    const result = await assemble(register({ instructionSource: 'hint' }), FULL_SECTIONS, undefined, agentAt(project()))
    expect(result.sections.map((section: any) => section.name)).toEqual(['deployment:persona-prefix', 'plan:policy'])
    expect(result.variables.workspace_instructions).toBeUndefined()
  })

  test('hint mode: replaces the first agent-instructions injection with a plugin hint', async () => {
    const message = instructionsMessage('instructions-1', ['/repo/AGENTS.md', '/repo/docs/AGENTS.md'])
    const result = await preStep(register({ instructionSource: 'hint' }), agentOf(), [message])
    expect(result.kind).toBe('enter')
    expect(result.messages).toHaveLength(1)
    const hint = result.messages[0]
    expect(hint.id).toBe('instructions-1')
    expect(hint.role).toBe('user')
    expect(hint.source).toEqual({ kind: 'plugin', plugin: 'liangshen-minimal-prompt' })
    expect(hint.content[0].text).toContain('/repo/AGENTS.md, /repo/docs/AGENTS.md')
    expect(hint.content[0].text).toContain('not task instructions')
  })

  test('hint mode: mints a message id when the instructions message carries none', async () => {
    const message = { content: [{ type: 'text', text: 'Instructions from: /repo/AGENTS.md' }], source: { kind: 'agent-instructions' } }
    const result = await preStep(register({ instructionSource: 'hint' }), agentOf(), [message])
    expect(typeof result.messages[0].id).toBe('string')
    expect(result.messages[0].id.length).toBeGreaterThan(0)
  })

  test('hint mode: drops later agent-instructions injections and keeps other messages', async () => {
    const harness = register({ instructionSource: 'hint' })
    const agent = agentOf()
    const first = await preStep(harness, agent, [instructionsMessage('a', ['/repo/AGENTS.md'])])
    expect(first.messages).toHaveLength(1)
    const second = await preStep(harness, agent, [
      { id: 'user', source: { kind: 'user' } },
      instructionsMessage('b', ['/repo/AGENTS.md']),
    ])
    expect(second.messages.map((message: any) => message.id)).toEqual(['user'])
  })

  test('hint mode: keeps an agent-instructions injection that names no reference file', async () => {
    const message = { id: 'a', content: [{ type: 'text', text: 'no paths here' }], source: { kind: 'agent-instructions' } }
    const result = await preStep(register({ instructionSource: 'hint' }), agentOf(), [message])
    expect(result.messages).toEqual([message])
  })

  test('hint mode: hints again after a compaction', async () => {
    const harness = register({ instructionSource: 'hint' })
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
