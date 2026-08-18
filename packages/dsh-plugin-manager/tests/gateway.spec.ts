import { describe, expect, it } from 'vitest'
import { findDshBinary } from '../src/host/gateway.ts'
import { sourceKindOf } from '../src/host/state.ts'

describe('findDshBinary', () => {
  const exists = (present: string[]) => (path: string) => present.includes(path)

  it('finds a dsh on a POSIX PATH', () => {
    expect(findDshBinary({ PATH: '/usr/bin' }, 'darwin', exists(['/usr/bin/dsh']))).toBe('/usr/bin/dsh')
  })

  it('finds a dsh.cmd on Windows', () => {
    expect(findDshBinary({ PATH: 'C:\\tools' }, 'win32', exists(['C:\\tools\\dsh.cmd']))).toBe('C:\\tools\\dsh.cmd')
  })

  it('falls back to the darwin homebrew location', () => {
    expect(findDshBinary({ PATH: '/nothing' }, 'darwin', exists(['/opt/homebrew/bin/dsh']))).toBe('/opt/homebrew/bin/dsh')
  })

  it('returns null when nothing matches', () => {
    expect(findDshBinary({ PATH: '/definitely/absent' }, 'linux', exists([]))).toBeNull()
  })
})

describe('sourceKindOf', () => {
  it('classifies registry specs as npm and git/link specs as git', () => {
    expect(sourceKindOf('@scope/pkg')).toBe('npm')
    expect(sourceKindOf('pkg@1.0.0')).toBe('npm')
    expect(sourceKindOf('link:/x/packages/y')).toBe('git')
    expect(sourceKindOf('git+https://github.com/a/b')).toBe('git')
    expect(sourceKindOf('github:a/b')).toBe('git')
    expect(sourceKindOf('https://github.com/a/b')).toBe('git')
  })
})
