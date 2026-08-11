import { z } from 'zod'
import type { Message, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import type { EpochHeader, SessionEvent, SurfaceEvent } from '@deepseek-ai/dsh-session'
import { isSurfaceEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { LiveTokenUsageProjection, TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client'
import {
  estimateAssistantBlockTokens,
  estimateContentTokens,
  estimateHeaderTokens,
  estimateMessageTokens,
  estimateTextBlockTokens,
  estimateToolCallBlockTokens,
} from './estimator.ts'
import type { EstimatorSpec } from './estimator.ts'

export type { LiveTokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client'

const zeroBuckets = (): TokenUsageProjection => ({
  uncachedInputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
})

const bucketsFrom = (usage: TokenUsage): TokenUsageProjection => ({
  uncachedInputTokens: usage.inputTokens,
  outputTokens: usage.outputTokens,
  cacheReadTokens: usage.cacheReadTokens ?? 0,
  cacheWriteTokens: usage.cacheWriteTokens ?? 0,
})

const addReplacing = (
  totals: TokenUsageProjection,
  previous: TokenUsageProjection | undefined,
  next: TokenUsageProjection,
): TokenUsageProjection => ({
  uncachedInputTokens: totals.uncachedInputTokens - (previous?.uncachedInputTokens ?? 0) + next.uncachedInputTokens,
  outputTokens: totals.outputTokens - (previous?.outputTokens ?? 0) + next.outputTokens,
  cacheReadTokens: totals.cacheReadTokens - (previous?.cacheReadTokens ?? 0) + next.cacheReadTokens,
  cacheWriteTokens: totals.cacheWriteTokens - (previous?.cacheWriteTokens ?? 0) + next.cacheWriteTokens,
})

const projectionSchema = z.object({
  uncachedInputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  estimated: z.boolean(),
  tokensPerSecond: z.number().nonnegative().optional(),
}).strict() as unknown as z.ZodType<LiveTokenUsageProjection>

interface SurfaceNode {
  seq: number
  tokens: number
}

type OutputBlock =
  | { kind: 'text'; characters: number }
  | { kind: 'reasoning'; characters: number }
  | { kind: 'tool-call'; nameCharacters: number; argumentCharacters: number }
  | { kind: 'fixed'; tokens: number }

interface ActiveStep {
  turn: number
  step: number
  buckets: TokenUsageProjection
  exact: boolean
  blocks: Array<OutputBlock | undefined>
  firstOutputTime?: number
  latestOutputTime?: number
}

interface SettledSample {
  turn: number
  step: number
  buckets: TokenUsageProjection
  estimated: boolean
  /** Last measured throughput; carried across rate-less steps. */
  tokensPerSecond: number | undefined
}

interface State {
  settled: TokenUsageProjection
  settledEstimates: number
  last: SettledSample | null
  surface: SurfaceNode[]
  surfaceTokens: number
  header: EpochHeader | undefined
  active: ActiveStep | null
}

function surfaceMessage(event: SurfaceEvent): Message {
  switch (event.type) {
    case 'user/message':
      return event.data
    case 'assistant/message':
    case 'tool/result':
      return event.data.message
  }
}

function applySurface(
  state: State,
  event: SurfaceEvent,
  spec: EstimatorSpec,
): Pick<State, 'surface' | 'surfaceTokens'> {
  const tokens = estimateMessageTokens(surfaceMessage(event), spec)
  if (event.surfaceOp === 'append') {
    return {
      surface: [...state.surface, { seq: event.seq, tokens }],
      surfaceTokens: state.surfaceTokens + tokens,
    }
  }
  const operation = event.surfaceOp
  const start = state.surface.findIndex(node => node.seq === operation.start)
  const end = state.surface.findIndex(node => node.seq === operation.end)
  if (start === -1 || end === -1 || start > end) {
    throw new Error(
      `live-stats: replace at seq ${event.seq} has invalid current range ${operation.start}-${operation.end}`,
    )
  }
  const removed = state.surface.slice(start, end + 1)
    .reduce((sum, node) => sum + node.tokens, 0)
  return {
    surface: [
      ...state.surface.slice(0, start),
      { seq: event.seq, tokens },
      ...state.surface.slice(end + 1),
    ],
    surfaceTokens: state.surfaceTokens - removed + tokens,
  }
}

function applyOutputChunk(
  blocks: Array<OutputBlock | undefined>,
  chunk: StreamChunk,
  spec: EstimatorSpec,
): Array<OutputBlock | undefined> {
  const next = [...blocks]
  switch (chunk.type) {
    case 'text-delta': {
      if (chunk.text === '') return blocks
      const previous = next[chunk.index]
      next[chunk.index] = {
        kind: 'text',
        characters: (previous?.kind === 'text' ? previous.characters : 0) + chunk.text.length,
      }
      return next
    }
    case 'reasoning-delta': {
      if (chunk.text === '') return blocks
      const previous = next[chunk.index]
      next[chunk.index] = {
        kind: 'reasoning',
        characters: (previous?.kind === 'reasoning' ? previous.characters : 0) + chunk.text.length,
      }
      return next
    }
    case 'tool-call-delta': {
      if (chunk.name === undefined && chunk.argumentsDelta === '') return blocks
      const previous = next[chunk.index]
      next[chunk.index] = {
        kind: 'tool-call',
        nameCharacters: chunk.name?.length ?? (previous?.kind === 'tool-call' ? previous.nameCharacters : 0),
        argumentCharacters: (previous?.kind === 'tool-call' ? previous.argumentCharacters : 0)
          + chunk.argumentsDelta.length,
      }
      return next
    }
    case 'block-end':
      next[chunk.index] = { kind: 'fixed', tokens: estimateContentTokens([chunk.block], spec) }
      return next
    default:
      return blocks
  }
}

function outputTokens(blocks: readonly (OutputBlock | undefined)[], spec: EstimatorSpec): number {
  const tokens: number[] = []
  for (const block of blocks) {
    if (block === undefined) continue
    switch (block.kind) {
      case 'text':
      case 'reasoning':
        tokens.push(estimateTextBlockTokens(block.characters, spec))
        break
      case 'tool-call':
        tokens.push(estimateToolCallBlockTokens(block.nameCharacters, block.argumentCharacters, spec))
        break
      case 'fixed':
        tokens.push(block.tokens)
        break
    }
  }
  return estimateAssistantBlockTokens(tokens, spec)
}

function rateOf(step: ActiveStep): number | undefined {
  if (step.firstOutputTime === undefined || step.latestOutputTime === undefined) return
  const elapsedMs = step.latestOutputTime - step.firstOutputTime
  if (elapsedMs <= 0 || step.buckets.outputTokens <= 0) return
  return step.buckets.outputTokens * 1_000 / elapsedMs
}

function exactStep(step: ActiveStep, usage: TokenUsage, time: number): ActiveStep {
  return {
    ...step,
    buckets: bucketsFrom(usage),
    exact: true,
    ...(usage.outputTokens > 0
      ? { firstOutputTime: step.firstOutputTime ?? time, latestOutputTime: time }
      : {}),
  }
}

function view(state: State): LiveTokenUsageProjection {
  const active = state.active
  const previous = active !== null
    && state.last?.turn === active.turn
    && state.last.step === active.step
    ? state.last
    : undefined
  const buckets = active === null
    ? state.settled
    : addReplacing(state.settled, previous?.buckets, active.buckets)
  const estimates = state.settledEstimates
    - (previous?.estimated === true ? 1 : 0)
    + (active !== null && !active.exact ? 1 : 0)
  // Resident throughput: once any step measured a rate, keep reporting it.
  // Without the fallback the row drops out between output bursts (an active
  // step before its first chunk) and after a rate-less step settles — the
  // stats band must not flicker while the other groups stay put.
  const rate = active === null
    ? state.last?.tokensPerSecond
    : rateOf(active) ?? state.last?.tokensPerSecond
  return {
    ...buckets,
    estimated: estimates > 0,
    ...(rate === undefined ? {} : { tokensPerSecond: rate }),
  }
}

/** Create the replayable live usage projection consumed by DSH Web and the TPS row.
 * @param spec - resolved estimator settings for the fold.
 * @returns the replayable `liveTokenUsage` projection definition.
 */
export function createLiveTokenUsageProjectionDefinition(
  spec: EstimatorSpec,
): ProjectionDefinition<'liveTokenUsage', State> {
  return {
    key: 'liveTokenUsage',
    schema: projectionSchema,
    init: () => ({
      settled: zeroBuckets(),
      settledEstimates: 0,
      last: null,
      surface: [],
      surfaceTokens: 0,
      header: undefined,
      active: null,
    }),
    apply: (state, event: SessionEvent) => {
      let next = state
      if (event.type === 'step/start') {
        next = {
          ...next,
          active: {
            ...event.data,
            buckets: {
              ...zeroBuckets(),
              uncachedInputTokens: estimateHeaderTokens(state.header, spec) + state.surfaceTokens,
            },
            exact: false,
            blocks: [],
          },
        }
      } else if (event.type === 'request/header') {
        next = {
          ...next,
          header: event.data.header,
          ...(next.active === null ? {} : {
            active: {
              ...next.active,
              buckets: {
                ...next.active.buckets,
                uncachedInputTokens: estimateHeaderTokens(event.data.header, spec) + state.surfaceTokens,
              },
            },
          }),
        }
      } else if (event.type === 'assistant/chunk' && next.active !== null) {
        const { chunk } = event.data
        if (chunk.type === 'usage') {
          next = { ...next, active: exactStep(next.active, chunk.usage, event.time) }
        } else {
          const blocks = applyOutputChunk(next.active.blocks, chunk, spec)
          if (blocks !== next.active.blocks) {
            const tokens = outputTokens(blocks, spec)
            next = {
              ...next,
              active: {
                ...next.active,
                blocks,
                buckets: { ...next.active.buckets, outputTokens: tokens },
                /* v8 ignore next -- every mutating chunk prices at least one
                 * non-empty block, so outputTokens is always positive here */
                ...(tokens > 0
                  ? {
                    firstOutputTime: next.active.firstOutputTime ?? event.time,
                    latestOutputTime: event.time,
                  }
                  : {}),
              },
            }
          }
        }
      } else if (event.type === 'assistant/message' && next.active !== null) {
        next = {
          ...next,
          active: event.data.usage === undefined
            ? {
              ...next.active,
              ...(next.active.buckets.outputTokens > 0 ? { latestOutputTime: event.time } : {}),
            }
            : exactStep(next.active, event.data.usage, event.time),
        }
      } else if (event.type === 'step/end' && next.active !== null) {
        const active = next.active
        const rate = rateOf(active)
        const previous = next.last?.turn === active.turn && next.last.step === active.step
          ? next.last
          : undefined
        next = {
          ...next,
          settled: addReplacing(next.settled, previous?.buckets, active.buckets),
          settledEstimates: next.settledEstimates
          - (previous?.estimated === true ? 1 : 0)
          + (!active.exact ? 1 : 0),
          last: {
            turn: active.turn,
            step: active.step,
            buckets: active.buckets,
            estimated: !active.exact,
            // Carry the last measured rate across a rate-less step instead of
            // clobbering it: the row stays resident (see view()).
            tokensPerSecond: rate ?? state.last?.tokensPerSecond,
          },
          active: null,
        }
      } else if (event.type === 'turn/end'
      && event.data.reason.kind !== 'completed'
      && next.last?.turn === event.data.turn
      && next.last.estimated) {
        next = {
          ...next,
          settled: addReplacing(next.settled, next.last.buckets, zeroBuckets()),
          settledEstimates: next.settledEstimates - 1,
          last: null,
        }
      }

      if (isSurfaceEvent(event)) next = { ...next, ...applySurface(next, event, spec) }
      return next
    },
    view,
    stateVersion: 1,
  }
}
