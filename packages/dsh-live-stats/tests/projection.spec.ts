import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  createMessage, createToolResultMessage, createUserMessage,
} from '@deepseek-ai/dsh-llm'
import type { CallId, TokenUsage } from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { apply, inject, resolveEstimatorConfig } from '../src/index.ts'
import { createLiveTokenUsageProjectionDefinition } from '../src/projection.ts'
import type { LiveTokenUsageProjection } from '../src/projection.ts'

afterEach(() => { vi.useRealTimers() })

async function harness(): Promise<{ ctx: Context; session: Session }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin({ inject, apply })
  return { ctx, session: ctx.sessions.create() }
}

function projected(ctx: Context, session: Session): LiveTokenUsageProjection {
  const value = ctx.sessionProjections.snapshot(session).values.liveTokenUsage
  if (value === undefined) throw new Error('liveTokenUsage projection is absent')
  return value
}

function usageChunk(session: Session, usage: TokenUsage): number {
  return session.append('assistant/chunk', {
    turn: 1,
    step: 1,
    chunk: { type: 'usage', usage },
  }).seq
}

describe('liveTokenUsage projection', () => {
  it('resolves configurable estimation parameters and rejects invalid values', () => {
    expect(resolveEstimatorConfig({
      charsPerToken: 2,
      blockOverhead: 1,
      roleOverhead: 3,
    })).toEqual({
      charsPerToken: 2,
      blockOverhead: 1,
      roleOverhead: 3,
    })
    expect(() => resolveEstimatorConfig({ charsPerToken: 0 })).toThrow('charsPerToken')
    expect(() => resolveEstimatorConfig({ blockOverhead: 0.5 })).toThrow('blockOverhead')
    expect(() => resolveEstimatorConfig({ unknown: 1 } as never)).toThrow('unknown config key')
  })

  it('updates input, output, and TPS per chunk, then accepts provider correction', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const { ctx, session } = await harness()
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'abcd' }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    session.append('step/start', { turn: 1, step: 1 })
    session.append('request/header', {
      header: { config: { provider: 'mock', model: 'mock' }, system: 'abcd' },
      reason: 'initial',
    })
    expect(projected(ctx, session)).toMatchObject({
      uncachedInputTokens: 14,
      outputTokens: 0,
      estimated: true,
    })

    vi.setSystemTime(2_000)
    session.append('assistant/chunk', {
      turn: 1,
      step: 1,
      chunk: { type: 'text-delta', index: 0, text: 'abcd' },
    })
    vi.setSystemTime(3_000)
    session.append('assistant/chunk', {
      turn: 1,
      step: 1,
      chunk: { type: 'text-delta', index: 0, text: 'efgh' },
    })
    expect(projected(ctx, session)).toMatchObject({
      outputTokens: 10,
      estimated: true,
      tokensPerSecond: 10,
    })

    vi.setSystemTime(4_000)
    usageChunk(session, { inputTokens: 20, outputTokens: 30, cacheReadTokens: 80 })
    expect(projected(ctx, session)).toEqual({
      uncachedInputTokens: 20,
      outputTokens: 30,
      cacheReadTokens: 80,
      cacheWriteTokens: 0,
      estimated: false,
      tokensPerSecond: 15,
    })

    // Settling with a positive elapsed window keeps the rate on the last row.
    session.append('step/end', { turn: 1, step: 1 })
    expect(projected(ctx, session).tokensPerSecond).toBe(15)
  })

  it('keeps a usage-exact output exact against later output deltas', async () => {
    const { ctx, session } = await harness()
    session.append('step/start', { turn: 1, step: 1 })
    session.append('assistant/chunk', {
      turn: 1,
      step: 1,
      chunk: { type: 'text-delta', index: 0, text: 'abcd' },
    })
    expect(projected(ctx, session)).toMatchObject({ estimated: true })

    usageChunk(session, { inputTokens: 5, outputTokens: 30 })
    expect(projected(ctx, session)).toMatchObject({ outputTokens: 30, estimated: false })

    // A trailing output delta after the exact usage must not re-estimate it.
    session.append('assistant/chunk', {
      turn: 1,
      step: 1,
      chunk: { type: 'text-delta', index: 0, text: 'extra' },
    })
    expect(projected(ctx, session)).toMatchObject({ outputTokens: 30, estimated: false })
  })

  it('keeps the last measured rate resident across rate-less steps', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const { ctx, session } = await harness()
    session.append('step/start', { turn: 1, step: 1 })
    vi.setSystemTime(2_000)
    session.append('assistant/chunk', {
      turn: 1, step: 1,
      chunk: { type: 'text-delta', index: 0, text: 'abcd' },
    })
    vi.setSystemTime(3_000)
    session.append('assistant/chunk', {
      turn: 1, step: 1,
      chunk: { type: 'text-delta', index: 0, text: 'efgh' },
    })
    // 10 estimated tokens over the 1s window.
    session.append('step/end', { turn: 1, step: 1 })
    expect(projected(ctx, session).tokensPerSecond).toBe(10)

    // A new step before its first output keeps the last rate on the row.
    session.append('step/start', { turn: 2, step: 1 })
    expect(projected(ctx, session).tokensPerSecond).toBe(10)

    // A step that settles without output does not erase it either.
    session.append('step/end', { turn: 2, step: 1 })
    expect(projected(ctx, session).tokensPerSecond).toBe(10)
  })

  it('replaces same-step retry estimates and drops aborted estimates', async () => {
    const { ctx, session } = await harness()
    session.append('step/start', { turn: 1, step: 1 })
    session.append('assistant/chunk', {
      turn: 1,
      step: 1,
      chunk: { type: 'text-delta', index: 0, text: 'discarded' },
    })
    session.append('step/end', { turn: 1, step: 1 })

    session.append('step/start', { turn: 1, step: 1 })
    const source = usageChunk(session, { inputTokens: 20, outputTokens: 5, cacheReadTokens: 80 })
    session.append('assistant/message', {
      turn: 1,
      step: 1,
      message: createMessage({
        role: 'assistant',
        content: [{ type: 'text', text: 'done' }],
        source: { kind: 'model', provider: 'mock', model: 'mock' },
      }),
      usage: { inputTokens: 20, outputTokens: 5, cacheReadTokens: 80 },
    }, { surfaceOp: 'append', sourceEventSeqs: [source] })
    session.append('step/end', { turn: 1, step: 1 })
    expect(projected(ctx, session)).toMatchObject({
      uncachedInputTokens: 20,
      outputTokens: 5,
      cacheReadTokens: 80,
      estimated: false,
    })

    session.append('step/start', { turn: 2, step: 1 })
    session.append('assistant/chunk', {
      turn: 2,
      step: 1,
      chunk: { type: 'text-delta', index: 0, text: 'partial' },
    })
    session.append('step/end', { turn: 2, step: 1 })
    session.append('turn/end', { turn: 2, reason: { kind: 'aborted', reason: { kind: 'user' } } })
    expect(projected(ctx, session)).toMatchObject({
      uncachedInputTokens: 20,
      outputTokens: 5,
      cacheReadTokens: 80,
      estimated: false,
    })
  })

  it('prices every streaming chunk kind, including no-op deltas', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const { ctx, session } = await harness()
    // A header arriving before any step only refreshes the stored header.
    session.append('request/header', {
      header: { config: { provider: 'mock', model: 'mock' }, system: 'pre' },
      reason: 'initial',
    })
    session.append('step/start', { turn: 1, step: 1 })
    // A header arriving mid-step refreshes the input estimate.
    session.append('request/header', {
      header: { config: { provider: 'mock', model: 'mock' }, system: 'abcd' },
      reason: 'change',
    })
    session.append('assistant/chunk', {
      turn: 1, step: 1,
      chunk: { type: 'reasoning-delta', index: 0, text: 'th' },
    })
    session.append('assistant/chunk', {
      turn: 1, step: 1,
      chunk: { type: 'reasoning-delta', index: 0, text: 'ink' },
    })
    // Empty deltas never create or extend blocks.
    session.append('assistant/chunk', {
      turn: 1, step: 1,
      chunk: { type: 'text-delta', index: 0, text: '' },
    })
    session.append('assistant/chunk', {
      turn: 1, step: 1,
      chunk: { type: 'reasoning-delta', index: 0, text: '' },
    })
    session.append('assistant/chunk', {
      turn: 1, step: 1,
      chunk: { type: 'tool-call-delta', index: 1, id: 'call_1' as CallId, argumentsDelta: '' },
    })
    session.append('assistant/chunk', {
      turn: 1, step: 1,
      chunk: { type: 'tool-call-delta', index: 1, id: 'call_1' as CallId, name: 'bash', argumentsDelta: '{}' },
    })
    // A nameless continuation extends the existing tool-call block.
    session.append('assistant/chunk', {
      turn: 1, step: 1,
      chunk: { type: 'tool-call-delta', index: 1, id: 'call_1' as CallId, argumentsDelta: ' more' },
    })
    // A nameless delta on a fresh index prices with zero name characters.
    session.append('assistant/chunk', {
      turn: 1, step: 1,
      chunk: { type: 'tool-call-delta', index: 4, id: 'call_2' as CallId, argumentsDelta: 'x' },
    })
    // Block-start chunks are inert for estimation.
    session.append('assistant/chunk', {
      turn: 1, step: 1,
      chunk: { type: 'block-start', index: 0, blockType: 'text' },
    })
    // A settled block pins its exact estimate.
    session.append('assistant/chunk', {
      turn: 1, step: 1,
      chunk: { type: 'block-end', index: 0, block: { type: 'text', text: 'fixed' } },
    })
    // A chunk landing past a gap leaves the gap blocks unpriced.
    session.append('assistant/chunk', {
      turn: 1, step: 1,
      chunk: { type: 'text-delta', index: 3, text: 'tail' },
    })
    expect(projected(ctx, session)).toMatchObject({
      uncachedInputTokens: 5,
      estimated: true,
    })
    const outputTokens = projected(ctx, session).outputTokens
    expect(outputTokens).toBeGreaterThan(0)

    // Provider usage without cache-read reporting fills the buckets from scratch.
    session.append('assistant/chunk', {
      turn: 1, step: 1,
      chunk: { type: 'usage', usage: { inputTokens: 7, outputTokens: 2 } },
    })
    expect(projected(ctx, session)).toMatchObject({
      uncachedInputTokens: 7,
      outputTokens: 2,
      cacheReadTokens: 0,
      estimated: false,
    })

    // An assistant message without usage keeps the output-timing window open.
    vi.setSystemTime(2_000)
    session.append('assistant/message', {
      turn: 1,
      step: 1,
      message: createMessage({
        role: 'assistant',
        content: [{ type: 'text', text: 'settled' }],
        source: { kind: 'model', provider: 'mock', model: 'mock' },
      }),
    }, { surfaceOp: 'append' })
    expect(projected(ctx, session).tokensPerSecond).toBeGreaterThan(0)
  })

  it('settles zero-output steps without a rate and accepts zero-output usage', async () => {
    const { ctx, session } = await harness()
    session.append('step/start', { turn: 1, step: 1 })
    session.append('step/end', { turn: 1, step: 1 })
    expect(projected(ctx, session)).toMatchObject({
      uncachedInputTokens: 0,
      outputTokens: 0,
      estimated: true,
    })
    expect(projected(ctx, session).tokensPerSecond).toBeUndefined()

    session.append('step/start', { turn: 2, step: 1 })
    usageChunk(session, { inputTokens: 5, outputTokens: 0, cacheReadTokens: 0 })
    session.append('step/end', { turn: 2, step: 1 })
    expect(projected(ctx, session)).toMatchObject({
      uncachedInputTokens: 5,
      outputTokens: 0,
      estimated: true,
    })
  })

  it('views during an active step, replacing same-step and keeping other-step estimates', async () => {
    const { ctx, session } = await harness()
    session.append('step/start', { turn: 1, step: 1 })
    session.append('assistant/chunk', {
      turn: 1, step: 1,
      chunk: { type: 'text-delta', index: 0, text: 'first' },
    })
    session.append('step/end', { turn: 1, step: 1 })
    expect(projected(ctx, session).estimated).toBe(true)

    // A retry of the same step: the view replaces the settled estimate.
    session.append('step/start', { turn: 1, step: 1 })
    expect(projected(ctx, session)).toMatchObject({ estimated: true })
    session.append('assistant/chunk', {
      turn: 1, step: 1,
      chunk: { type: 'text-delta', index: 0, text: 'retry' },
    })
    expect(projected(ctx, session)).toMatchObject({
      uncachedInputTokens: 0,
      estimated: true,
    })

    // A different-turn step keeps the settled totals visible underneath.
    session.append('step/start', { turn: 2, step: 1 })
    const during = projected(ctx, session)
    expect(during.estimated).toBe(true)
    expect(during.outputTokens).toBeGreaterThan(0)
  })

  it('settles an output-less assistant message without opening the timing window', async () => {
    const { ctx, session } = await harness()
    session.append('step/start', { turn: 1, step: 1 })
    session.append('assistant/message', {
      turn: 1,
      step: 1,
      message: createMessage({
        role: 'assistant',
        content: [{ type: 'text', text: 'none' }],
        source: { kind: 'model', provider: 'mock', model: 'mock' },
      }),
    }, { surfaceOp: 'append' })
    session.append('step/end', { turn: 1, step: 1 })
    expect(projected(ctx, session).tokensPerSecond).toBeUndefined()
    expect(projected(ctx, session)).toMatchObject({ outputTokens: 0, estimated: true })
  })

  it('prices tool results and user messages on the surface', async () => {
    const { ctx, session } = await harness()
    session.append('tool/result', {
      turn: 1,
      step: 1,
      message: createToolResultMessage({
        callId: 'call_1' as CallId,
        content: [{ type: 'text', text: 'abcd' }],
        isError: false,
      }),
    }, { surfaceOp: 'append' })
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'efgh' }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    session.append('step/start', { turn: 1, step: 1 })
    // Tool result: 5 (text) + 4 (block) + 4 (role); user message: 5 + 4 (role).
    expect(projected(ctx, session).uncachedInputTokens).toBe(22)
  })

  it('replaces surface ranges and rejects invalid ranges', async () => {
    const { ctx, session } = await harness()
    const first = session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'one' }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    const second = session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'two' }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'three' }],
      source: { kind: 'user' },
    }), { surfaceOp: { op: 'replace', start: first.seq, end: second.seq }, sourceEventSeqs: [first.seq, second.seq] })
    session.append('step/start', { turn: 1, step: 1 })
    // One message (5 chars → 2 + 4 + 4): the replaced pair is gone.
    expect(projected(ctx, session).uncachedInputTokens).toBe(10)

    const definition = createLiveTokenUsageProjectionDefinition(resolveEstimatorConfig({}))
    let state = definition.init()
    const append = (text: string, surfaceOp: unknown): void => {
      state = definition.apply(state, {
        type: 'user/message',
        seq: 1,
        time: 1,
        data: createUserMessage({
          content: [{ type: 'text', text }],
          source: { kind: 'user' },
        }),
        surfaceOp,
      } as unknown as SessionEvent)
    }
    append('one', 'append')
    expect(() => { append('bad', { op: 'replace', start: 5, end: 2 }) }).toThrow('invalid current range')
  })
})
