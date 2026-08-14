/**
 * Analyze one or more DSH session JSONL exports and report the LiangShen
 * trajectory markers: first-turn surface, promotion boundary, reasoning-block
 * word markers (`we` / `let me` / `let's` / `I`), the first reasoning line,
 * and per-step drift points.
 *
 * Usage:
 *   node tools/analyze-session.mjs <session.jsonl> [more.jsonl ...]
 */

import { createReadStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import readline from 'node:readline'

import { classifyReasoning } from '../presets/liangshen/tool-bootstrap.mjs'

const WORD = {
  we: /\bwe\b/gi,
  letMe: /\blet me\b/gi,
  lets: /\blet's\b/gi,
  i: /\bi\b/gi,
}

export function countMarkers(text) {
  return {
    we: countWord(text, WORD.we),
    letMe: countWord(text, WORD.letMe),
    lets: countWord(text, WORD.lets),
    i: countWord(text, WORD.i),
  }
}

function countWord(text, regex) {
  return [...text.matchAll(regex)].length
}

export async function readEvents(path) {
  const events = []
  const input = createReadStream(path)
  const lines = readline.createInterface({ input, crlfDelay: Infinity })
  for await (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    try {
      events.push(JSON.parse(trimmed))
    } catch {
      // Ignore malformed tail lines from a partially flushed export.
    }
  }
  return events
}

/** Aggregate one session's model-visible trajectory facts. */
export function analyzeSession(events) {
  const session = events.find(event => event.type === 'session') ?? {}
  const firstHeader = events.find(event => event.type === 'request/header')
  const firstHeaderSeq = firstHeader?.seq ?? Number.POSITIVE_INFINITY
  const firstMessages = []
  const headers = []
  const toolCalls = new Map()
  const steps = new Map()
  let current = null
  const reasoningBlocks = []

  for (const event of events) {
    if (event.type === 'user/message' && event.seq < firstHeaderSeq) {
      firstMessages.push(event.data?.source?.kind ?? 'unknown')
    }
    if (event.type === 'request/header') {
      headers.push({
        seq: event.seq,
        reason: event.data?.reason,
        tools: (event.data?.header?.tools ?? []).map(tool => tool.name),
      })
    }
    if (event.type === 'step/start') {
      current = { turn: event.data?.turn, step: event.data?.step }
      const key = stepKey(current)
      if (!steps.has(key)) {
        steps.set(key, { turn: current.turn, step: current.step, blocks: 0, ...zeroMarkers(), text: 0, firstLine: null })
      }
    }
    if (event.type === 'assistant/message' && current !== null) {
      const step = steps.get(stepKey(current))
      for (const block of event.data?.message?.content ?? []) {
        if (block.type === 'reasoning') {
          const text = String(block.text ?? '')
          const markers = countMarkers(text)
          reasoningBlocks.push({ ...markers, text })
          step.blocks += 1
          for (const key of markerKeys()) step[key] += markers[key]
          if (step.firstLine === null && text.trim().length > 0) {
            step.firstLine = text.trim().split(/\r?\n/, 1)[0] ?? ''
          }
        } else if (block.type === 'text' && String(block.text ?? '').trim().length > 0) {
          step.text += 1
        }
      }
    }
    if (event.type === 'tool/call') {
      const name = event.data?.name ?? 'unknown'
      toolCalls.set(name, (toolCalls.get(name) ?? 0) + 1)
    }
  }

  const markers = reasoningBlocks.reduce((sum, block) => {
    for (const key of markerKeys()) sum[key] += block[key]
    return sum
  }, zeroMarkers())
  const totalMarkers = markers.we + markers.letMe
  const firstReasoning = reasoningBlocks[0]
  const firstClassification = firstReasoning === undefined ? null : classifyReasoning(firstReasoning.text)
  const driftSteps = [...steps.values()]
    .filter(step => step.letMe > 0 || (step.firstLine !== null && classifyReasoning(step.firstLine).label === 'standard-like'))
    .map(step => ({
      turn: step.turn,
      step: step.step,
      letMe: step.letMe,
      we: step.we,
      text: step.text,
      firstLine: step.firstLine,
    }))
  const visibleReplies = [...steps.values()].reduce((sum, step) => sum + step.text, 0)

  return {
    sessionId: session.id,
    preset: session.agentPreset,
    cwd: session.cwd,
    createdAt: session.createdAt,
    firstMessages,
    firstHeader: firstHeader === undefined ? null : {
      system: firstHeader.data?.header?.system,
      tools: (firstHeader.data?.header?.tools ?? []).map(tool => tool.name),
      config: firstHeader.data?.header?.config,
    },
    headers,
    reasoningBlocks: reasoningBlocks.length,
    markers,
    ratio: totalMarkers === 0 ? null : markers.we / totalMarkers,
    firstReasoningLine: firstReasoning?.text.trim().split(/\r?\n/, 1)[0] ?? null,
    firstClassification,
    visibleReplies,
    toolCalls: [...toolCalls.entries()].sort((a, b) => b[1] - a[1]),
    driftSteps,
  }
}

function stepKey(step) {
  return `${step.turn}:${step.step}`
}

function markerKeys() {
  return ['we', 'letMe', 'lets', 'i']
}

function zeroMarkers() {
  return { we: 0, letMe: 0, lets: 0, i: 0 }
}

export function renderSessionReport(report) {
  const lines = []
  lines.push(`session ${report.sessionId ?? '(unknown)'}`)
  lines.push(`  preset=${report.preset ?? '(none)'} cwd=${report.cwd ?? '(none)'}`)
  lines.push(`  first messages: ${report.firstMessages.join(', ')}`)
  lines.push(`  first header: ${report.firstHeader?.tools.join('/') ?? '(none)'} | system=${JSON.stringify(report.firstHeader?.system ?? '')}`)
  for (const header of report.headers) {
    lines.push(`  header seq=${header.seq} reason=${header.reason ?? '?'} tools=${header.tools.length} [${header.tools.slice(0, 6).join(', ')}${header.tools.length > 6 ? ', ...' : ''}]`)
  }
  lines.push(`  reasoning blocks=${report.reasoningBlocks} we=${report.markers.we} let_me=${report.markers.letMe} let's=${report.markers.lets} I=${report.markers.i}`)
  lines.push(`  we/(we+let_me)=${report.ratio === null ? 'n/a' : report.ratio.toFixed(2)} visible replies=${report.visibleReplies}`)
  if (report.firstReasoningLine !== null) {
    lines.push(`  first reasoning: ${report.firstReasoningLine}`)
    lines.push(`  first block label: ${report.firstClassification?.label ?? 'n/a'} (score ${report.firstClassification?.score ?? '-'})`)
  }
  if (report.toolCalls.length > 0) {
    lines.push(`  top tools: ${report.toolCalls.slice(0, 6).map(([name, count]) => `${name}=${count}`).join(' ')}`)
  }
  if (report.driftSteps.length > 0) {
    lines.push(`  drift steps: ${report.driftSteps.slice(0, 12).map(step => `(${step.turn},${step.step}) lm=${step.letMe} we=${step.we} vis=${step.text}`).join(' | ')}`)
  } else {
    lines.push('  drift steps: none')
  }
  return lines.join('\n')
}

const isMain = process.argv[1] !== undefined
  && (await import('node:url')).pathToFileURL(process.argv[1]).href === import.meta.url

if (isMain) {
  const files = process.argv.slice(2)
  if (files.length === 0) {
    console.error('usage: node tools/analyze-session.mjs <session.jsonl> [more.jsonl ...]')
    process.exitCode = 1
  } else {
    for (const file of files) {
      const events = await readEvents(file)
      if (events.length === 0) {
        console.error(`no events read from ${file}`)
        process.exitCode = 1
        continue
      }
      console.log(renderSessionReport(analyzeSession(events)))
      console.log()
    }
  }
}
