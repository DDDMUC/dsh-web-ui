import { describe, expect, it } from 'vitest'
import { foldGuardSignal, renderGuardMessage, stepDownEffort, name } from '../presets/liangshen/guard.mjs'

/** Build a step's events: optional reasoning chars, optional output. */
function step(reasoningChars, { toolCall = false, visibleText = false } = {}) {
  const events = [{ type: 'step/start' }]
  if (reasoningChars > 0) {
    events.push({ type: 'assistant/message', data: { message: { content: [{ type: 'reasoning', text: 'x'.repeat(reasoningChars) }] } } })
  }
  if (visibleText) {
    events.push({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'done' }] } } })
  }
  if (toolCall) {
    events.push({ type: 'tool/call', data: { name: 'read', callId: 'c1', arguments: '{}' } })
    events.push({ type: 'tool/result', data: { callId: 'c1', message: { content: [{ type: 'text', text: 'ok' }] } } })
  }
  return events
}

/** A failing tool call/result pair with a distinct callId. */
function failingCall(callId, tool = 'bash', args = '{"cmd":"pytest"}') {
  return [
    { type: 'tool/call', data: { name: tool, callId, arguments: args } },
    { type: 'tool/result', data: { callId, error: { name: 'ToolCallError', code: 'E_FAIL' } } },
  ]
}

describe('guard foldGuardSignal', () => {
  it('operator sees no signal on an empty or healthy stream', () => {
    // Given an empty stream and a healthy stream with outputs.
    const healthy = [
      ...step(3000, { toolCall: true }),
      ...step(2500, { visibleText: true }),
      ...step(100, {}),
    ]
    // When the fold runs, Then neither reports a degeneration signal.
    expect(foldGuardSignal([]).signal).toBeUndefined()
    expect(foldGuardSignal(healthy).signal).toBeUndefined()
  })

  it('operator sees a stall after N consecutive zero-output long-reasoning steps', () => {
    // Given three steps that each reason long and produce nothing.
    const events = [
      ...step(3000, {}),
      ...step(2500, {}),
      ...step(4000, {}),
    ]
    // When the fold runs, Then it reports a stall with the streak length.
    const verdict = foldGuardSignal(events)
    expect(verdict.signal).toBe('stall')
    expect(verdict.detail).toContain('3')
  })

  it('operator sees no stall below the threshold or when output breaks the streak', () => {
    // Given streaks that are too short or broken by a tool call.
    const two = [...step(3000, {}), ...step(3000, {})]
    const broken = [
      ...step(3000, {}),
      ...step(3000, { toolCall: true }),
      ...step(3000, {}),
      ...step(3000, {}),
    ]
    // When the fold runs, Then neither reaches the stall threshold.
    expect(foldGuardSignal(two).signal).toBeUndefined()
    expect(foldGuardSignal(broken).signal).toBeUndefined()
  })

  it('operator sees short-reasoning steps ignored (real answers with brief thought)', () => {
    // Given steps whose reasoning stays under the character floor.
    const events = [...step(500, {}), ...step(800, {}), ...step(100, {})]
    // When the fold runs, Then no step counts toward a stall.
    expect(foldGuardSignal(events).signal).toBeUndefined()
  })

  it('operator sees an echo after M identical-argument failures', () => {
    // Given the same call failing three times in a row.
    const events = [
      ...failingCall('a'),
      ...failingCall('b'),
      ...failingCall('c'),
    ]
    // When the fold runs, Then it reports an echo loop.
    const verdict = foldGuardSignal(events)
    expect(verdict.signal).toBe('echo')
  })

  it('operator sees the echo streak reset on success or a different call', () => {
    // Given two failures, a success, then two more failures.
    const recovered = [
      ...failingCall('a'),
      ...failingCall('b'),
      { type: 'tool/call', data: { name: 'bash', callId: 'ok1', arguments: '{"cmd":"pytest"}' } },
      { type: 'tool/result', data: { callId: 'ok1', message: { content: [{ type: 'text', text: 'passed' }] } } },
      ...failingCall('c'),
      ...failingCall('d'),
    ]
    // When the fold runs, Then the success reset the streak and no echo fires.
    expect(foldGuardSignal(recovered).signal).toBeUndefined()
    // Given calls where no three in a row share one signature.
    const different = [
      ...failingCall('a'),
      ...failingCall('b', 'bash', '{"cmd":"ls"}'),
      ...failingCall('c', 'bash', '{"cmd":"ls"}'),
    ]
    // When the fold runs, Then the echo streak never completes.
    expect(foldGuardSignal(different).signal).toBeUndefined()
  })

  it('operator can tune the thresholds', () => {
    // Given streams below the default thresholds.
    const events = [...step(3000, {}), ...step(3000, {})]
    const smallChars = [...step(600, {}), ...step(600, {}), ...step(600, {})]
    // When the fold runs with tighter thresholds, Then both fire.
    expect(foldGuardSignal(events, { stallSteps: 2 }).signal).toBe('stall')
    expect(foldGuardSignal(smallChars, { stallReasoningChars: 500 }).signal).toBe('stall')
  })
})

describe('guard stepDownEffort', () => {
  it('operator steps one notch down the ladder and leaves unknown levels alone', () => {
    // Given the known ladder and levels outside it.
    // When a step-down is computed, Then known levels move one notch and the rest stay untouched.
    expect(stepDownEffort('max')).toBe('high')
    expect(stepDownEffort('high')).toBe('low')
    expect(stepDownEffort('low')).toBeUndefined()
    expect(stepDownEffort('off')).toBeUndefined()
    expect(stepDownEffort(undefined)).toBeUndefined()
    expect(stepDownEffort(75)).toBeUndefined()
  })
})

describe('guard renderGuardMessage', () => {
  it('operator reads the interrupted pattern named for each signal', () => {
    // Given each verdict, When the message renders, Then it names the pattern and the breaker.
    expect(renderGuardMessage({ signal: 'stall' })).toContain('no tool call')
    expect(renderGuardMessage({ signal: 'echo' })).toContain('identical arguments')
    expect(renderGuardMessage({ signal: 'stall' })).toContain('[Circuit Breaker]')
  })
})

describe('guard plugin identity', () => {
  it('operator can rely on the stable cordis plugin name', () => {
    // Given the plugin module, When its name is read, Then it is the stable id.
    expect(name).toBe('liangshen-guard')
  })
})
