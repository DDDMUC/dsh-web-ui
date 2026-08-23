import { mkdtempSync, readFileSync, readdirSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { readActiveSelection, readActiveState, writeActiveSelection, writeActiveState } from '../src/active-state.ts'

const { originalRename } = vi.hoisted(() => ({
  originalRename: { impl: null as unknown as typeof renameSync },
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  originalRename.impl = actual.renameSync
  return { ...actual, renameSync: vi.fn(actual.renameSync) }
})

const renameMock = vi.mocked(renameSync)

describe('active-state persistence (issue #678: atomic write)', () => {
  let dir: string
  let path: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'active-state-'))
    path = join(dir, 'skin-center-active.json')
    renameMock.mockReset()
    renameMock.mockImplementation(originalRename.impl)
  })

  it('writes a valid JSON document and reads it back', () => {
    writeActiveSelection(path, 'skin-a')
    expect(readActiveSelection(path)).toBe('skin-a')
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ active: 'skin-a' })
  })

  it('persists null (stock look)', () => {
    writeActiveSelection(path, null)
    expect(readActiveSelection(path)).toBeNull()
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ active: null })
  })

  it('creates the parent directory on demand', () => {
    const nested = join(dir, 'a', 'b', 'active.json')
    writeActiveSelection(nested, 'skin-a')
    expect(readActiveSelection(nested)).toBe('skin-a')
  })

  it('leaves no temp directories behind after a successful write', () => {
    writeActiveSelection(path, 'skin-a')
    expect(readdirSync(dir)).toEqual(['skin-center-active.json'])
  })

  it('roundtrips the background section (issue #996)', () => {
    writeActiveState(path, { active: 'skin-a', background: { backgroundOpacity: 100, backgroundBlurEmpty: 4 } })
    expect(readActiveState(path)).toEqual({
      active: 'skin-a',
      background: { backgroundOpacity: 100, backgroundBlurEmpty: 4 },
    })
  })

  it('merges updates: a skin switch keeps the background and vice versa', () => {
    writeActiveState(path, { active: 'skin-a', background: { backgroundOpacity: 80 } })
    writeActiveState(path, { background: { backgroundOpacity: 60, backgroundBlurContent: 5 } })
    expect(readActiveState(path)).toEqual({
      active: 'skin-a',
      background: { backgroundOpacity: 60, backgroundBlurContent: 5 },
    })
    writeActiveSelection(path, 'skin-b')
    expect(readActiveState(path)).toEqual({
      active: 'skin-b',
      background: { backgroundOpacity: 60, backgroundBlurContent: 5 },
    })
  })

  it('normalizes stored background data and drops unknown keys', () => {
    writeActiveState(path, { background: { backgroundOpacity: 140, backgroundBlurEmpty: -3, bogus: 1 } as never })
    expect(readActiveState(path).background).toEqual({ backgroundOpacity: 100, backgroundBlurEmpty: 0 })
  })

  it('reads legacy files without a background key as null', () => {
    writeActiveSelection(path, 'skin-a')
    expect(readActiveState(path)).toEqual({ active: 'skin-a', background: null })
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ active: 'skin-a' })
  })

  it('keeps the previous content when the rename fails mid-write', () => {
    writeActiveSelection(path, 'skin-a')
    expect(readActiveSelection(path)).toBe('skin-a')
    renameMock.mockImplementationOnce(() => {
      throw new Error('simulated crash')
    })
    expect(() => writeActiveSelection(path, 'skin-b')).toThrow('simulated crash')
    // The half-written temp file must never replace the previous document.
    expect(readActiveSelection(path)).toBe('skin-a')
    expect(readFileSync(path, 'utf8')).toContain('"skin-a"')
    // The failed attempt must clean up its temp directory.
    expect(readdirSync(dir)).toEqual(['skin-center-active.json'])
  })
})
