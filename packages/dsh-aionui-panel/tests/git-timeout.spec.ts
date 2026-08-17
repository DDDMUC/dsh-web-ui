/** Git status deadline tests: timeout aborts the signal before rejecting. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runGitStatusWithTimeout } from '../src/host/routes.ts'

describe('runGitStatusWithTimeout', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('aborts the subprocess signal at 15 seconds', async () => {
    let signal: AbortSignal | undefined
    const pending = runGitStatusWithTimeout((current) => {
      signal = current
      return new Promise(() => {})
    })

    const rejected = expect(pending).rejects.toThrow('git status timed out')
    await vi.advanceTimersByTimeAsync(15_000)

    await rejected
    expect(signal?.aborted).toBe(true)
    expect(signal?.reason).toEqual(expect.objectContaining({ message: 'git status timed out' }))
  })
})
