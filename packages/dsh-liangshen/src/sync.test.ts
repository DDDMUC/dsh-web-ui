import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync, readFileSync } from 'node:fs'
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

  it('retires a previously bundled preset directory removed from the source', () => {
    const f = fixture()
    try {
      syncPresetTrees(f.source, f.target)
      mkdirSync(join(f.target, 'liangshen-exact'), { recursive: true })
      writeFileSync(join(f.target, 'liangshen-exact', 'agent.cordis.yml'), 'rows: []\n')
      const result = syncPresetTrees(f.source, f.target, ['liangshen-exact'])
      expect(result.retired).toEqual(['liangshen-exact'])
      expect(existsSync(join(f.target, 'liangshen-exact'))).toBe(false)
      expect(existsSync(join(f.target, 'liangshen'))).toBe(true)
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

  it('removes target files whose source file was deleted', () => {
    const f = fixture()
    try {
      syncPresetTrees(f.source, f.target)
      rmSync(join(f.source, 'liangshen', 'tool-bootstrap.mjs'))
      const second = syncPresetTrees(f.source, f.target)
      expect(second.synced).toEqual(['liangshen'])
      expect(existsSync(join(f.target, 'liangshen', 'tool-bootstrap.mjs'))).toBe(false)
      expect(readFileSync(join(f.target, 'liangshen', 'agent.cordis.yml'), 'utf8')).toBe('rows: []\n')
    } finally { f.dispose() }
  })

  it('rewrites a same-size, same-mtime file whose bytes differ', () => {
    const f = fixture()
    try {
      syncPresetTrees(f.source, f.target)
      const source = join(f.source, 'liangshen', 'agent.cordis.yml')
      const dest = join(f.target, 'liangshen', 'agent.cordis.yml')
      writeFileSync(dest, 'rowx: []\n')
      const stat = statSync(source)
      utimesSync(dest, stat.atime, stat.mtime)
      expect(statSync(dest).size).toBe(stat.size)
      expect(Math.abs(statSync(dest).mtimeMs - stat.mtimeMs)).toBeLessThan(1)
      const second = syncPresetTrees(f.source, f.target)
      expect(second.synced).toEqual(['liangshen'])
      expect(readFileSync(dest, 'utf8')).toBe('rows: []\n')
    } finally { f.dispose() }
  })

  it('removes extra nested files and the directories they leave empty', () => {
    const f = fixture()
    try {
      syncPresetTrees(f.source, f.target)
      mkdirSync(join(f.target, 'liangshen', 'extra', 'nested'), { recursive: true })
      writeFileSync(join(f.target, 'liangshen', 'extra', 'nested', 'leftover.txt'), 'x\n')
      const second = syncPresetTrees(f.source, f.target)
      expect(second.synced).toEqual(['liangshen'])
      expect(existsSync(join(f.target, 'liangshen', 'extra'))).toBe(false)
      expect(readFileSync(join(f.target, 'liangshen', 'agent.cordis.yml'), 'utf8')).toBe('rows: []\n')
    } finally { f.dispose() }
  })

  it('replaces a regular file at the target preset path with a directory', () => {
    const f = fixture()
    try {
      mkdirSync(f.target, { recursive: true })
      writeFileSync(join(f.target, 'liangshen'), 'not a directory\n')
      const result = syncPresetTrees(f.source, f.target)
      expect(result.synced).toEqual(['liangshen'])
      expect(statSync(join(f.target, 'liangshen')).isDirectory()).toBe(true)
      expect(readFileSync(join(f.target, 'liangshen', 'preset.yml'), 'utf8')).toContain('梁神模式')
    } finally { f.dispose() }
  })

  it('reports a missing source root as an empty run', () => {
    const f = fixture()
    try {
      const result = syncPresetTrees(join(f.source, 'nope'), f.target)
      expect(result).toEqual({ synced: [], current: [], failed: [], retired: [] })
    } finally { f.dispose() }
  })
})
