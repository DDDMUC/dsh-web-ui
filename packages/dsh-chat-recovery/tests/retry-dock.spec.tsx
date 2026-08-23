import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RetryDockView, type RetryDockProps } from '../src/client/RetryDock.tsx'
import type { RetryState, RetrySupervisor } from '../src/core/retry-supervisor.ts'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'

afterEach(cleanup)

const SOURCE = 'source' as SessionId
const CHILD = 'child' as SessionId

function renderDock(sessionId: SessionId, state: RetryState): ReturnType<typeof render> {
  const supervisor = {
    subscribe: () => () => {},
    getSnapshot: () => state,
    cancel: vi.fn(),
    retryNow: vi.fn(),
  } as unknown as RetrySupervisor
  const props = {
    session: { sessionId },
    t: (key: string) => key,
    supervisor,
    manualRetry: vi.fn(),
  } as unknown as RetryDockProps
  return render(<RetryDockView {...props} />)
}

describe('RetryDockView', () => {
  it('keeps the retry controls on the child that owns an inter-attempt wait', () => {
    const state: RetryState = {
      phase: 'waiting',
      kind: 'auto',
      attempt: 2,
      maxAttempts: 5,
      delayMs: 2000,
      sourceId: SOURCE,
      targetId: CHILD,
      reason: null,
    }

    const childDock = renderDock(CHILD, state)
    expect(childDock.container.textContent).toContain('retry.waiting')
    expect(childDock.container.textContent).toContain('retry.retryNow')
    childDock.unmount()

    const sourceDock = renderDock(SOURCE, state)
    expect(sourceDock.container.textContent).toBe('')
  })
})
