/**
 * Report aggregation: the statistics a default decision would rest on.
 *
 * These tests pin the two things a reader cannot check by eye: that an
 * infrastructure failure never enters a success-rate denominator, and that a
 * paired comparison uses the task as the paired unit and reports its uncertainty.
 */

import { describe, expect, it } from 'vitest'

import {
  aggregateGroups,
  isInfrastructureFailure,
  meanConfidenceInterval,
  pairedComparison,
  renderMarkdown,
  wilsonInterval,
} from '../tools/benchmark-report.mjs'

function run(overrides: Record<string, unknown> = {}) {
  return {
    variant: 'B',
    taskId: 'task-1',
    passed: true,
    timedOut: false,
    requests: [{ seq: 1 }],
    usage: { uncachedInputTokens: 100, outputTokens: 20, cacheReadTokens: 0, totalTokens: 120 },
    durationMs: 1000,
    toolCalls: 2,
    toolErrors: 0,
    humanInterventions: 0,
    approvalsAsked: 0,
    costUsd: null,
    ...overrides,
  }
}

describe('benchmark report statistics', () => {
  it('bounds a Wilson interval inside the unit range', () => {
    const interval = wilsonInterval(3, 3)!
    expect(interval.low).toBeGreaterThan(0)
    expect(interval.high).toBeLessThanOrEqual(1)
    expect(wilsonInterval(0, 0)).toBeNull()
  })

  it('reports a mean and interval for a small sample', () => {
    const interval = meanConfidenceInterval([0, 1, 1])!
    expect(interval.mean).toBeCloseTo(2 / 3, 6)
    expect(interval.low).toBeLessThan(interval.mean)
    expect(interval.high).toBeGreaterThan(interval.mean)
    expect(meanConfidenceInterval([])).toBeNull()
  })

  it('treats a timeout or a request-free log as an infrastructure failure', () => {
    expect(isInfrastructureFailure(run({ timedOut: true }))).toBe(true)
    expect(isInfrastructureFailure(run({ requests: [] }))).toBe(true)
    expect(isInfrastructureFailure(run({ passed: null }))).toBe(true)
    expect(isInfrastructureFailure(run())).toBe(false)
  })

  it('keeps infrastructure failures out of the success-rate denominator', () => {
    const groups = aggregateGroups([
      run({ variant: 'B', passed: true }),
      run({ variant: 'B', passed: false }),
      run({ variant: 'B', timedOut: true, passed: false }),
    ])
    expect(groups.B.sessions).toBe(3)
    expect(groups.B.graded).toBe(2)
    expect(groups.B.infrastructureFailures).toBe(1)
    expect(groups.B.successRate).toBe(0.5)
  })

  it('pairs a comparison by task and reports the mean delta with its interval', () => {
    const runs = [
      run({ variant: 'B', taskId: 'a', passed: true }),
      run({ variant: 'B', taskId: 'a', passed: true }),
      run({ variant: 'P', taskId: 'a', passed: true }),
      run({ variant: 'P', taskId: 'a', passed: true }),
      run({ variant: 'B', taskId: 'b', passed: false }),
      run({ variant: 'B', taskId: 'b', passed: false }),
      run({ variant: 'P', taskId: 'b', passed: true }),
      run({ variant: 'P', taskId: 'b', passed: true }),
    ]
    const comparison = pairedComparison(runs, 'B', 'P')
    expect(comparison.tasks).toBe(2)
    expect(comparison.pairedMeanDelta).toBeCloseTo(0.5, 6)
    expect(comparison.perTask.find((entry: { taskId: string }) => entry.taskId === 'b')?.delta).toBe(1)
  })

  it('renders the treatment notes a reader needs to interpret the table', () => {
    const markdown = renderMarkdown({
      generatedAt: '2026-09-13T00:00:00.000Z',
      baselineGroup: 'B',
      baseline: { repository: { commit: 'abc' }, presetSourceHash: 'deadbeef', dshVersion: 'dsh 1.2.3', route: { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'max' }, platform: 'win32', node: 'v22.0.0', taskRevision: { id: 'seed', version: 1, tasks: 11, hash: 'a'.repeat(64) } },
      suite: { stopReason: 'completed', sessions: 4 },
      groups: aggregateGroups([run()]),
      comparisons: [],
      runs: 1,
    })
    expect(markdown).toContain('# LiangShen V4.1 Flash comparison report')
    expect(markdown).toContain('Group N is the full native roster, not Minimal')
    expect(markdown).toContain('Infrastructure failures')
    expect(markdown).toContain('analyze-session.mjs')
  })
})
