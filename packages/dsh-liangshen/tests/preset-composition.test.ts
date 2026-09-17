/**
 * Composition guard for the shipped preset file: the committed
 * `agent.cordis.yml` must stay structurally valid, mount the preset-local
 * plugins, and keep the persona row on the schema the installed SDK accepts.
 *
 * The persona section-name assertion is the regression guard for the class of
 * defect where a harness rename silently stops matching a hardcoded name —
 * the filter then drops every section and the session runs on an empty system
 * prompt. The names are pinned against the installed SDK constant instead of a
 * copy of it.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PERSONA_PREFIX_SECTION, PERSONA_SUFFIX_SECTION } from '@deepseek-ai/dsh-system-prompt'
import { describe, expect, it } from 'vitest'

import { PERSONA_SECTION_NAMES, PLAN_POLICY_SECTION_NAME, name as promptName } from '../presets/liangshen/minimal-prompt.mjs'
import { name as catalogName } from '../presets/liangshen/tool-catalog.mjs'
import { validateAgentCordis } from '../src/schema.ts'

const preset = readFileSync(join(process.cwd(), 'presets/liangshen/agent.cordis.yml'), 'utf8')

/**
 * The text of one top-level `- id: <id>` row: its own line and the indented
 * block under it. The row ends at the next top-level line of any kind, so a
 * comment block following the row is not mistaken for part of its YAML.
 */
function row(id: string): string {
  const start = preset.indexOf(`- id: ${id}\n`)
  if (start < 0) return ''
  const rest = preset.slice(start + 1)
  const next = rest.search(/^\S/m)
  return next < 0 ? rest : rest.slice(0, next)
}

describe('liangshen preset composition', () => {
  it('is structurally valid for the preset loader', () => {
    expect(validateAgentCordis(preset)).toEqual([])
  })

  it('mounts the minimal-prompt and tool-catalog plugins', () => {
    expect(promptName).toBe('liangshen-minimal-prompt')
    expect(catalogName).toBe('liangshen-tool-catalog')
    expect(row('minimal-prompt')).toContain('name: ./minimal-prompt.mjs')
    expect(row('tool-catalog')).toContain('name: ./tool-catalog.mjs')
    expect(preset).not.toContain('tool-bootstrap')
  })

  it('keeps the persona row on the current schema with the discipline prefix', () => {
    const persona = row('persona')
    expect(persona).toContain("name: '@deepseek-ai/dsh-persona'")
    expect(persona).toContain('prefix: |-')
    expect(persona).toContain('You are a helpful software engineer assistant.')
    // The standing working discipline ships inside the persona prefix: the
    // thinking-disruption fuse, action-oriented steps, and YAGNI/PDCA.
    expect(persona).toContain('Thinking Disruption: Do not repeat reasoning on the same hypothesis more than twice')
    expect(persona).toContain('immediately close </think> and call native inspection tools')
    expect(persona).toContain('Action-Oriented: Thinking must focus solely on determining the next concrete operation')
    expect(persona).toContain('Parallel Inspection: When multiple independent inspections, searches, or checks are needed')
    expect(persona).toContain('Follow YAGNI and the PDCA loop')
    expect(persona).toContain('Do not write redundant comments.')
    expect(persona).not.toContain('text:')
    expect(persona).not.toContain('complete:')
    // Runtime contexts are durable user-role messages, not prompt text: they
    // stay enabled.
    expect(persona).not.toContain('includeRuntimeContext')
  })

  it('declares the plugin configs explicitly', () => {
    expect(row('minimal-prompt')).toContain('keepPlanPolicy: true')
    // The shipped default hands workspace instructions back to the harness's
    // own agent-instructions row; the other two sources stay opt-in.
    expect(row('minimal-prompt')).toContain('instructionSource: host')
    expect(row('minimal-prompt')).toContain('instructionMaxBytes: 65536')
    expect(row('tool-catalog')).toContain('descriptionMaxLength: 200')
  })

  it("declares the 'both' presentation with no paged patterns by default, and no retired keys", () => {
    expect(row('tool-catalog')).toContain("presentation: 'both'")
    expect(row('tool-catalog')).toContain("pagedToolPatterns: []")
    expect(row('tool-catalog')).not.toContain('ptcPresentation')
    expect(row('tool-catalog')).not.toContain('anchorTools')
  })

  it('mounts working-context and does not mount tool-activate', () => {
    expect(row('tool-activate')).toBe('')
    expect(row('working-context')).toContain('name: ./working-context.mjs')
  })

  it('does not mount reasoning-effort plugin', () => {
    expect(row('reasoning-effort')).toBe('')
  })

  it('keeps the native and ptc presentation variants structurally valid', () => {
    for (const mode of ['native', 'ptc']) {
      const variant = preset.replace("presentation: 'both'", `presentation: '${mode}'`)
      expect(variant).not.toBe(preset)
      expect(validateAgentCordis(variant), mode).toEqual([])
    }
  })

  it('ships the balanced tool-result pruning budgets', () => {
    const pruner = row('compaction')
    expect(pruner).toContain('thresholdChars: 8192')
    expect(pruner).toContain('headChars: 4096')
    expect(pruner).toContain('tailChars: 1024')
  })

  it('keeps run_code the only model-authored orchestration surface', () => {
    // The builtin PTC preset's one roster difference: the engine row stays for
    // `ralph`, the workflow tool does not publish beside `run_code`.
    const workflow = row('workflow-worker-thread')
    expect(workflow).toContain("name: '@deepseek-ai/dsh-tool-workflow'")
    expect(workflow).toContain('disabled: true')
  })

  it('accepts the persona section name the installed SDK registers', () => {
    expect(PERSONA_SECTION_NAMES).toContain(PERSONA_PREFIX_SECTION)
    expect(PERSONA_SECTION_NAMES).not.toContain(PERSONA_SUFFIX_SECTION)
    expect(PLAN_POLICY_SECTION_NAME).toBe('plan:policy')
  })
})