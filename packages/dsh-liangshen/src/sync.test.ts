import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { syncPresetTrees } from './sync.ts'

function fixture(): { source: string; target: string; dispose: () => void } {
  const base = mkdtempSync(join(tmpdir(), 'dsh-liangshen-'))
  const source = join(base, 'presets')
  const target = join(base, 'agent-presets')
  mkdirSync(join(source, 'liangshen'), { recursive: true })
  writeFileSync(join(source, 'liangshen', 'agent.cordis.yml'), 'rows: []\n')
  writeFileSync(join(source, 'liangshen', 'tool-bootstrap.mjs'), 'export const name = "x"\n')
  writeFileSync(join(source, 'liangshen', 'preset.yml'), 'name: 梁神模式\n')
  return { source, target, dispose: () => rmSync(base, { recursive: true, force: true }) }
}

describe('syncPresetTrees', () => {
  it('copies the bundled preset tree into the target root', () => {
    const f = fixture()
    try {
      const result = syncPresetTrees(f.source, f.target)
      expect(result.synced).toEqual(['liangshen'])
      expect(result.current).toEqual([])
      expect(result.failed).toEqual([])
      expect(readFileSync(join(f.target, 'liangshen', 'preset.yml'), 'utf8')).toContain('梁神模式')
      expect(readFileSync(join(f.target, 'liangshen', 'tool-bootstrap.mjs'), 'utf8')).toContain('x')
    } finally { f.dispose() }
  })

  it('is idempotent — a second run copies nothing', () => {
    const f = fixture()
    try {
      syncPresetTrees(f.source, f.target)
      const second = syncPresetTrees(f.source, f.target)
      expect(second.synced).toEqual([])
      expect(second.current).toEqual(['liangshen'])
    } finally { f.dispose() }
  })

  it('rewrites the tree when a file changed', () => {
    const f = fixture()
    try {
      syncPresetTrees(f.source, f.target)
      writeFileSync(join(f.target, 'liangshen', 'agent.cordis.yml'), 'changed\n')
      const third = syncPresetTrees(f.source, f.target)
      expect(third.synced).toEqual(['liangshen'])
      expect(readFileSync(join(f.target, 'liangshen', 'agent.cordis.yml'), 'utf8')).toBe('rows: []\n')
    } finally { f.dispose() }
  })

  it('never touches directories it does not own', () => {
    const f = fixture()
    try {
      syncPresetTrees(f.source, f.target)
      mkdirSync(join(f.target, 'user-authored'), { recursive: true })
      writeFileSync(join(f.target, 'user-authored', 'x.txt'), 'mine\n')
      const result = syncPresetTrees(f.source, f.target)
      expect(result.synced).toEqual([])
      expect(readFileSync(join(f.target, 'user-authored', 'x.txt'), 'utf8')).toBe('mine\n')
    } finally { f.dispose() }
  })

  it('reports a missing source root as an empty run', () => {
    const f = fixture()
    try {
      const result = syncPresetTrees(join(f.source, 'nope'), f.target)
      expect(result).toEqual({ synced: [], current: [], failed: [] })
    } finally { f.dispose() }
  })
})
