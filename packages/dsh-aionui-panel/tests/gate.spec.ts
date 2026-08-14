/**
 * Workspace-gate tests: the canonical membership function (isPathInside) —
 * the security boundary every fs/git path check relies on. Table-driven so a
 * sibling-prefix or off-by-one regression is caught immediately.
 *
 * Note: `..` collapse is the caller's job (join() happens before the check in
 * fs-service.resolveInsideRoot / git-service.pathsInside); isPathInside is a
 * pure prefix check on already-joined paths.
 */
import { describe, expect, it } from 'vitest'
import { isPathInside } from '../src/host/gate.ts'

describe('isPathInside', () => {
  it('accepts equality (with and without trailing slash)', () => {
    expect(isPathInside('/w', '/w')).toBe(true)
    expect(isPathInside('/w', '/w/')).toBe(true)
  })

  it('accepts descendants', () => {
    expect(isPathInside('/w', '/w/a')).toBe(true)
    expect(isPathInside('/w', '/w/a/b/c.txt')).toBe(true)
    expect(isPathInside('/w/a', '/w/a/b')).toBe(true)
  })

  it('rejects siblings and sibling-prefix paths', () => {
    expect(isPathInside('/w', '/w2')).toBe(false)
    expect(isPathInside('/w', '/w2/a')).toBe(false)
    expect(isPathInside('/w/a', '/w/a2')).toBe(false)
    expect(isPathInside('/w/a', '/w/a2/b')).toBe(false)
    expect(isPathInside('/w', '/w.txt')).toBe(false)
  })

  it('rejects parent escapes', () => {
    expect(isPathInside('/w', '/')).toBe(false)
    expect(isPathInside('/w', '/etc')).toBe(false)
    expect(isPathInside('/w/a', '/w')).toBe(false)
  })

  it('rejects empty roots and empty children', () => {
    expect(isPathInside('/w', '')).toBe(false)
    expect(isPathInside('', '/w')).toBe(false)
    expect(isPathInside('', '')).toBe(false)
  })
})

describe('isPathInside on win32 (separator + case robustness, issue #27)', () => {
  const platformDesc = Object.getOwnPropertyDescriptor(process, 'platform')!

  /** Run one assertion block with process.platform stubbed to win32. */
  function asWin32(fn: () => void): void {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    try {
      fn()
    } finally {
      Object.defineProperty(process, 'platform', platformDesc)
    }
  }

  it('normalizes backslashes from path.join against a forward-slash root', () => {
    asWin32(() => {
      // git rev-parse --show-toplevel returns forward slashes; path.join
      // yields backslashes — both must resolve inside the same root.
      expect(isPathInside('C:/Users/zcl/proj', 'C:\\Users\\zcl\\proj\\src\\a.ts')).toBe(true)
      expect(isPathInside('C:/Users/zcl/proj', 'C:/Users/zcl/proj/src/a.ts')).toBe(true)
    })
  })

  it('compares case-insensitively (the FS is case-insensitive)', () => {
    asWin32(() => {
      expect(isPathInside('C:/Users/zcl/proj', 'c:\\users\\ZCL\\proj\\src')).toBe(true)
      expect(isPathInside('c:\\users\\zcl\\proj', 'C:/Users/zcl/proj/x')).toBe(true)
    })
  })

  it('still rejects siblings and parent escapes on win32', () => {
    asWin32(() => {
      expect(isPathInside('C:/Users/zcl/proj', 'C:/Users/zcl/proj2/x')).toBe(false)
      expect(isPathInside('C:/Users/zcl/proj', 'C:/Users/zcl')).toBe(false)
      expect(isPathInside('C:/Users/zcl/proj', 'D:/Users/zcl/proj/x')).toBe(false)
    })
  })

  it('treats a root with a trailing slash as the same root', () => {
    asWin32(() => {
      expect(isPathInside('C:/proj', 'C:\\proj\\')).toBe(true)
    })
  })

  it('handles a bare drive-root boundary', () => {
    asWin32(() => {
      expect(isPathInside('C:/', 'C:/x')).toBe(true)
      expect(isPathInside('C:/', 'D:/x')).toBe(false)
    })
  })

  it('handles UNC share prefixes', () => {
    asWin32(() => {
      expect(isPathInside('\\\\server\\share', '\\\\server\\share\\x')).toBe(true)
      expect(isPathInside('\\\\server\\share', '\\\\server\\other\\x')).toBe(false)
    })
  })
})
