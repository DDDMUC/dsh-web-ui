/**
 * Live-benchmark harness: the two pure steps that decide what a run MEANS.
 *
 * The harness exists so a comparison cannot quietly measure the wrong thing, so
 * these tests pin the two places that could:
 * - \`materializePreset\` rewrites the variant's composition. The shipped file also
 *   names \`anchorTools: [bash]\` inside its prose, so a rewrite that matched the
 *   first occurrence would report a variant it never applied.
 * - \`summarizeSession\` reads the durable session shapes. The tool surface and the
 *   real model route live under \`request/header\` -> \`data.header\`, not at the top
 *   level, and an unread shape must stay visibly empty rather than look verified.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { LIVE_VARIANTS, summarizeSession, materializePreset } from '../tools/benchmark-live-run.mjs'

const scratch: string[] = []

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'liangshen-bench-test-'))
  scratch.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('benchmark live harness variant materialization', () => {
  it('rewrites the anchorTools CONFIG line, never the prose that names the same key', () => {
    const root = scratchDir()
    const target = materializePreset(root, 'bash-anchor', LIVE_VARIANTS['bash-anchor'])
    const text = readFileSync(join(target, 'agent.cordis.yml'), 'utf8')
    expect(text).toMatch(/^\s*anchorTools: \[bash\]$/m)
    // The composition's own prose still documents the bash-only experiment.
    expect(text).toContain('anchorTools: [bash]')
    // And the shipped four-tool default is gone from the config line.
    expect(text).not.toMatch(/^\s*anchorTools: \[bash, str_replace_editor/m)
  })

  it('keeps the shipped four-tool anchor when the variant varies nothing', () => {
    const root = scratchDir()
    const target = materializePreset(root, 'current-four', LIVE_VARIANTS['current-four'])
    const text = readFileSync(join(target, 'agent.cordis.yml'), 'utf8')
    expect(text).toMatch(/^\s*anchorTools: \[bash, str_replace_editor, exit_plan_mode, skill\]$/m)
    expect(text).toMatch(/^\s*ptcPresentation: true$/m)
  })

  it('turns PTC off for the native-promotion variant', () => {
    const root = scratchDir()
    const target = materializePreset(root, 'native-promotion', LIVE_VARIANTS['native-promotion'])
    const text = readFileSync(join(target, 'agent.cordis.yml'), 'utf8')
    expect(text).toMatch(/^\s*ptcPresentation: false$/m)
    expect(text).toMatch(/^\s*anchorTools: \[bash\]$/m)
  })

  it('copies the whole preset so its plugins travel with it', () => {
    const root = scratchDir()
    const target = materializePreset(root, 'current-four', LIVE_VARIANTS['current-four'])
    expect(readFileSync(join(target, 'minimal-prompt.mjs'), 'utf8')).toContain('liangshen-minimal-prompt')
    expect(readFileSync(join(target, 'tool-catalog.mjs'), 'utf8')).toContain('liangshen-tool-catalog')
  })
})

describe('benchmark live harness session evidence', () => {
  function log(events: unknown[]): string {
    const path = join(scratchDir(), 'session.v3.jsonl')
    writeFileSync(path, events.map((event) => JSON.stringify(event)).join('\n'), 'utf8')
    return path
  }

  it('reads the wire surface and the real model route from request/header', () => {
    const path = log([
      { type: 'request/header', seq: 12, data: { header: { config: { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'max' }, tools: [{ name: 'bash' }] } } },
      { type: 'request/header', seq: 32, data: { header: { config: { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'max' }, tools: [{ name: 'run_code' }] } } },
    ])
    const evidence = summarizeSession(path)
    expect(evidence.requests.map((request: { tools: string[] }) => request.tools)).toEqual([['bash'], ['run_code']])
    expect(evidence.requests[0]?.provider).toBe('deepseek-official')
    expect(evidence.requests[0]?.reasoningEffort).toBe('max')
  })

  it('reports an unreadable shape as empty instead of looking verified', () => {
    const path = log([{ type: 'request/header', seq: 1, data: {} }])
    const evidence = summarizeSession(path)
    expect(evidence.requests[0]?.tools).toEqual([])
    expect(evidence.requests[0]?.provider).toBeUndefined()
  })

  it('flags which prompt facts each assembled system message carries', () => {
    const path = log([
      { type: 'system/message', seq: 7, data: { turn: 1, step: 1, message: { role: 'system', content: [{ type: 'text', text: 'You are a helpful software engineer assistant.\n\nYour working directory is /work.\n\nInstructions from: AGENTS.md' }] } } },
      { type: 'system/message', seq: 29, data: { turn: 2, step: 1, message: { role: 'system', content: [{ type: 'text', text: 'You are a helpful software engineer assistant.\ndeclare const tools: ToolArgsMap\nrun_code is the only tool' }] } } },
    ])
    const evidence = summarizeSession(path)
    expect(evidence.prompts[0]).toMatchObject({ turn: 1, carriesPersona: true, carriesWorkspaceLine: true, carriesWorkspaceInstructions: true, carriesSdkSection: false })
    expect(evidence.prompts[1]).toMatchObject({ turn: 2, carriesSdkSection: true, carriesPtcRule: true })
  })

  it('counts the PTC dispatch evidence the promotion is supposed to produce', () => {
    const path = log([
      { type: 'tool/call', seq: 20, data: {} },
      { type: 'tool/ptc-dispatch-start', seq: 34, data: {} },
      { type: 'tool/ptc-dispatch', seq: 35, data: {} },
    ])
    const evidence = summarizeSession(path)
    expect(evidence.toolCalls).toBe(1)
    expect(evidence.ptcDispatches).toBe(1)
  })

  it('skips unparsable lines rather than failing the whole report', () => {
    const path = join(scratchDir(), 'session.v3.jsonl')
    writeFileSync(path, ['not json', JSON.stringify({ type: 'tool/call', seq: 1, data: {} })].join('\n'), 'utf8')
    expect(summarizeSession(path).toolCalls).toBe(1)
  })
})
