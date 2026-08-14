import { describe, expect, test } from 'vitest'

import { analyzeSession, countMarkers, renderSessionReport } from '../tools/analyze-session.mjs'

const events = [
  { type: 'session', id: 'session-test', agentPreset: 'liangshen', cwd: '/tmp/demo' },
  { type: 'user/message', seq: 7, data: { source: { kind: 'user' } } },
  { type: 'request/header', seq: 9, data: { reason: 'initial', header: { system: 'You are a helpful software engineer assistant.', tools: [{ name: 'bash' }, { name: 'read' }] } } },
  { type: 'step/start', seq: 10, data: { turn: 1, step: 1 } },
  { type: 'assistant/message', seq: 11, data: { message: { content: [{ type: 'reasoning', text: 'We need inspect the repo first.' }] } } },
  { type: 'tool/call', seq: 12, data: { name: 'bash' } },
  { type: 'tool/result', seq: 13 },
  { type: 'step/end', seq: 14 },
  { type: 'request/header', seq: 15, data: { reason: 'change', header: { tools: [{ name: 'bash' }, { name: 'read' }, { name: 'edit' }] } } },
]

describe('analyze-session', () => {
  test('countMarkers matches word boundaries case-insensitively', () => {
    expect(countMarkers('We need a plan. Let me check.')).toEqual({ we: 1, letMe: 1, lets: 0, i: 0 })
  })

  test('analyzeSession extracts surface, promotion, and marker facts', () => {
    const report = analyzeSession(events)
    expect(report.sessionId).toBe('session-test')
    expect(report.preset).toBe('liangshen')
    expect(report.firstMessages).toEqual(['user'])
    expect(report.firstHeader?.tools).toEqual(['bash', 'read'])
    expect(report.headers).toHaveLength(2)
    expect(report.markers).toEqual({ we: 1, letMe: 0, lets: 0, i: 0 })
    expect(report.ratio).toBe(1)
    expect(report.firstClassification?.label).toBe('minimal-like')
    expect(report.reasoningBlocks).toBe(1)
    expect(report.toolCalls).toEqual([['bash', 1]])
    expect(report.visibleReplies).toBe(0)
    expect(report.driftSteps).toHaveLength(0)
  })

  test('analyzeSession reports drift steps for standard-like blocks', () => {
    const drifted = [
      events[0],
      events[1],
      events[2],
      { type: 'step/start', seq: 10, data: { turn: 1, step: 1 } },
      { type: 'assistant/message', seq: 11, data: { message: { content: [{ type: 'reasoning', text: 'Let me check the repo.' }] } } },
    ]
    const report = analyzeSession(drifted)
    expect(report.firstClassification?.label).toBe('standard-like')
    expect(report.driftSteps).toHaveLength(1)
    expect(report.driftSteps[0]).toMatchObject({ turn: 1, step: 1, letMe: 1 })
  })

  test('renderSessionReport prints the headline facts', () => {
    const text = renderSessionReport(analyzeSession(events))
    expect(text).toContain('session session-test')
    expect(text).toContain('first header: bash/read')
    expect(text).toContain('first block label: minimal-like')
  })
})
