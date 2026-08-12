// @vitest-environment jsdom
/** ChatView: collapsible message folds, toolbar chips, and the bottom sheets. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SessionModels } from '@deepseek-ai/dsh-host-apiproxy/api/sessions'
import { ChatView } from './ChatView.tsx'
import { type SessionView } from './App.tsx'
import type { HistoryPage } from '../api.ts'
import type { WireEvent } from '../messages.ts'

// The api module is fully mocked; App.tsx's history wrapper is overridden to
// feed fixed history pages, its pure helpers (errorText / formatTime) stay real.
vi.mock('../api.ts', () => ({
  models: vi.fn(),
  selectModel: vi.fn(),
  sendCommand: vi.fn(),
}))
vi.mock('./App.tsx', async importOriginal => {
  const actual = await importOriginal<typeof import('./App.tsx')>()
  return {
    ...actual,
    loadHistory: vi.fn(),
    prompt: vi.fn(async () => {}),
  }
})
import { models, selectModel, sendCommand } from '../api.ts'
import { loadHistory } from './App.tsx'

const session: SessionView = {
  sessionId: 's-1',
  title: '测试会话',
  updatedAt: 1_700_000_000_000,
  running: false,
  blank: false,
}

/** Assemble one history entry wrapping a WireEvent (host history-page shape). */
function makeEntry(type: string, data: unknown, seq: number): { event: WireEvent } {
  return { event: { type, seq, time: seq * 1_000, data } }
}

/** Build a history page from loose wire events (the host union is strict). */
function historyPage(events: Array<{ event: WireEvent }>, extra: Record<string, unknown> = {}): HistoryPage {
  return { events: events as never, hasMore: false, ...extra } as HistoryPage
}

/** A full turn: user message, reasoning + text chunks, tool calls, final message. */
function turnEvents(): Array<{ event: WireEvent }> {
  return [
    makeEntry('user/message', { id: 'u-1', role: 'user', content: [{ type: 'text', text: '改一下代码' }] }, 0),
    makeEntry('assistant/chunk', { turn: 0, step: 0, chunk: { type: 'reasoning-delta', index: 0, text: '先看结构' } }, 1),
    makeEntry('assistant/chunk', { turn: 0, step: 0, chunk: { type: 'reasoning-delta', index: 0, text: '\n再看细节' } }, 2),
    makeEntry('assistant/chunk', { turn: 0, step: 0, chunk: { type: 'text-delta', index: 1, text: '正在处理' } }, 3),
    makeEntry('tool/call', { turn: 0, step: 0, callId: 'c1', name: 'bash', arguments: '{"cmd":"ls"}' }, 4),
    makeEntry('assistant/message', {
      turn: 0,
      step: 0,
      message: {
        id: 'a-1',
        role: 'assistant',
        content: [
          { type: 'reasoning', text: '先看结构\n再看细节' },
          { type: 'text', text: '已完成修改' },
        ],
      },
    }, 5),
  ]
}

const modelsMock = vi.mocked(models)
const selectModelMock = vi.mocked(selectModel)
const sendCommandMock = vi.mocked(sendCommand)
const loadHistoryMock = vi.mocked(loadHistory)

beforeEach(() => {
  modelsMock.mockResolvedValue({
    current: { provider: 'fx', model: 'fx-1' },
    routable: true,
    groups: [
      {
        id: 'fx',
        name: 'FX',
        models: [
          { id: 'fx-1', name: 'FX 标准' },
          { id: 'fx-2', name: 'FX 深度', reasoning: { efforts: [{ id: 'high', name: '高' }], defaultEffort: 'high' } },
        ],
      },
    ],
    failures: [],
  } satisfies SessionModels)
  selectModelMock.mockResolvedValue({ selected: { provider: 'fx', model: 'fx-2', reasoningEffort: 'high' } })
  sendCommandMock.mockResolvedValue({})
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ChatView message folds', () => {
  it('hides reasoning behind a collapsed disclosure and expands on tap', async () => {
    loadHistoryMock.mockResolvedValue(historyPage(turnEvents()))
    render(<ChatView session={session} onBack={() => {}} />)

    // The folded turn renders: user bubble, assistant text, disclosures.
    expect(await screen.findByText('改一下代码')).toBeTruthy()
    expect(await screen.findByText('已完成修改')).toBeTruthy()
    const head = await screen.findByRole('button', { name: /深度思考/ })
    expect(head.getAttribute('aria-expanded')).toBe('false')
    // Only the one-line summary shows while collapsed; the body stays hidden.
    expect(await screen.findByText('先看结构')).toBeTruthy()
    expect(screen.queryByText(/再看细节/)).toBeNull()

    fireEvent.click(head)
    expect(head.getAttribute('aria-expanded')).toBe('true')
    expect(await screen.findByText(/再看细节/)).toBeTruthy()
  })

  it('keeps the tool disclosure collapsed with a summary, then reveals arguments', async () => {
    loadHistoryMock.mockResolvedValue(historyPage(turnEvents()))
    render(<ChatView session={session} onBack={() => {}} />)

    const head = await screen.findByRole('button', { name: /工具/ })
    expect(head.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('{"cmd":"ls"}')).toBeNull()

    fireEvent.click(head)
    expect(head.getAttribute('aria-expanded')).toBe('true')
    expect(await screen.findByText('{"cmd":"ls"}')).toBeTruthy()
    expect(screen.getByText('bash')).toBeTruthy()
  })

  it('shows the permission chip from the history-tail projection and applies via /permission', async () => {
    loadHistoryMock.mockResolvedValue(historyPage(turnEvents(), {
      projections: {
        asOfSeq: 4,
        values: {
          permissions: {
            options: [
              { value: 'read-only', name: '只读' },
              { value: 'workspace-write', name: '读写工作区' },
            ],
            currentValue: 'read-only',
          },  
        } as Record<string, unknown>,
      },
    }))
    render(<ChatView session={session} onBack={() => {}} />)

    const chip = await screen.findByRole('button', { name: /只读/ })
    fireEvent.click(chip)
    // The sheet lists the presets; picking one dispatches the slash command.
    const writeOption = await screen.findByRole('button', { name: /读写工作区/ })
    fireEvent.click(writeOption)
    await waitFor(() => {
      expect(sendCommandMock).toHaveBeenCalledWith('s-1', '/permission workspace-write')
    })
  })

  it('requires an explicit confirm before enabling full access', async () => {
    loadHistoryMock.mockResolvedValue(historyPage(turnEvents(), {
      projections: {
        asOfSeq: 4,
        values: {
          permissions: {
            options: [{ value: 'danger-full-access', name: '完全权限' }],
            currentValue: 'workspace-write',
          },  
        } as Record<string, unknown>,
      },
    }))
    render(<ChatView session={session} onBack={() => {}} />)

    // The chip shows the derived label for the unmatched current value.
    fireEvent.click(await screen.findByRole('button', { name: /Workspace Write/ }))
    // Picking full access opens the confirmation sheet instead of submitting.
    fireEvent.click(await screen.findByRole('button', { name: /完全权限/ }))
    expect(await screen.findByText(/确认完全权限/)).toBeTruthy()
    expect(sendCommandMock).not.toHaveBeenCalled()
    // Cancelling dispatches nothing; opening again and confirming submits.
    fireEvent.click(screen.getByRole('button', { name: /取消/ }))
    fireEvent.click(screen.getByRole('button', { name: /完全权限/ }))
    fireEvent.click(await screen.findByRole('button', { name: /确认开启/ }))
    await waitFor(() => {
      expect(sendCommandMock).toHaveBeenCalledWith('s-1', '/permission danger-full-access')
    })
  })
})

describe('ChatView model sheet', () => {
  it('labels the toolbar chip with the current model and selects a new one', async () => {
    loadHistoryMock.mockResolvedValue(historyPage(turnEvents()))
    render(<ChatView session={session} onBack={() => {}} />)

    const chip = await screen.findByRole('button', { name: /模型/ })
    expect(chip.textContent).toContain('fx-1')

    fireEvent.click(chip)
    const deep = await screen.findByRole('button', { name: /FX 深度/ })
    fireEvent.click(deep)
    await waitFor(() => {
      expect(selectModelMock).toHaveBeenCalledWith('s-1', { provider: 'fx', model: 'fx-2', reasoningEffort: 'high' })
    })
  })

  it('offers effort choices for the current model and submits the picked effort', async () => {
    loadHistoryMock.mockResolvedValue(historyPage(turnEvents()))
    // The current model already is the effort-capable one.
    modelsMock.mockResolvedValue({
      current: { provider: 'fx', model: 'fx-2', reasoningEffort: 'high' },
      routable: true,
      groups: [
        {
          id: 'fx',
          name: 'FX',
          models: [
            { id: 'fx-1', name: 'FX 标准' },
            { id: 'fx-2', name: 'FX 深度', reasoning: { efforts: [{ id: 'high', name: '高' }], defaultEffort: 'high' } },
          ],
        },
      ],
      failures: [],
    } satisfies SessionModels)
    render(<ChatView session={session} onBack={() => {}} />)

    fireEvent.click(await screen.findByRole('button', { name: /模型/ }))
    const effort = await screen.findByRole('button', { name: /^高/ })
    fireEvent.click(effort)
    await waitFor(() => {
      expect(selectModelMock).toHaveBeenCalledWith('s-1', { provider: 'fx', model: 'fx-2', reasoningEffort: 'high' })
    })
  })

  it('explains a transport 403 on the model channel as a stale host', async () => {
    loadHistoryMock.mockResolvedValue(historyPage(turnEvents()))
    modelsMock.mockRejectedValue(new Error('HTTP 403'))
    render(<ChatView session={session} onBack={() => {}} />)

    fireEvent.click(await screen.findByRole('button', { name: /模型/ }))
    expect(await screen.findByText(/HTTP 403/)).toBeTruthy()
    expect(await screen.findByText(/重启 dsh web/)).toBeTruthy()
  })
})
