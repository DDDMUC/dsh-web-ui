/**
 * Aggregate live benchmark run records into a comparison report.
 *
 * The runner writes one JSON record per session plus a suite index. This module
 * turns those records into per-group statistics, paired per-task comparisons with
 * confidence intervals, and a Markdown summary. It keeps the outcome measures
 * separate from trajectory-style measurements: language-style counters stay with
 * tools/analyze-session.mjs.
 *
 * Usage:
 *   node tools/benchmark-report.mjs <results-dir> [--baseline B]
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Presentational order of the candidate matrix. */
export const GROUP_ORDER = ['B', 'P', 'T', 'N', 'M']

/** Two-sided 95% t critical values for small samples; the normal limit past 30 df. */
const T95 = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306,
  9: 2.262, 10: 2.228, 11: 2.201, 12: 2.179, 13: 2.16, 14: 2.145, 15: 2.131,
  16: 2.12, 17: 2.11, 18: 2.101, 19: 2.093, 20: 2.086, 21: 2.08, 22: 2.074,
  23: 2.069, 24: 2.064, 25: 2.06, 26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045,
  30: 2.042,
}

/** Wilson score interval for a binomial success rate. */
export function wilsonInterval(successes, total, z = 1.96) {
  if (!Number.isFinite(total) || total <= 0) return null
  const p = successes / total
  const denominator = 1 + (z * z) / total
  const centre = (p + (z * z) / (2 * total)) / denominator
  const spread = (z / denominator) * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))
  return { low: Math.max(0, centre - spread), high: Math.min(1, centre + spread) }
}

/** Mean of a numeric sample with a two-sided confidence interval. */
export function meanConfidenceInterval(values, confidence = 0.95) {
  const clean = values.filter((value) => typeof value === 'number' && Number.isFinite(value))
  if (clean.length === 0) return null
  const mean = clean.reduce((total, value) => total + value, 0) / clean.length
  if (clean.length === 1) return { mean, low: mean, high: mean, n: 1, sd: 0 }
  const variance = clean.reduce((total, value) => total + (value - mean) ** 2, 0) / (clean.length - 1)
  const sd = Math.sqrt(variance)
  const standardError = sd / Math.sqrt(clean.length)
  const critical = confidence === 0.95 ? (T95[clean.length - 1] ?? 1.96) : 1.96
  return { mean, low: mean - critical * standardError, high: mean + critical * standardError, n: clean.length, sd }
}

/**
 * A run that never produced a gradeable model attempt: it timed out or the
 * session log carries no request at all. These are infrastructure failures, are
 * reported separately, and stay out of every success-rate denominator.
 */
export function isInfrastructureFailure(run) {
  return run?.timedOut === true
    || (run?.requests?.length ?? 0) === 0
    || run?.passed === null
    || run?.passed === undefined
}

function sumOf(entries, pick) {
  return entries.reduce((total, entry) => total + (pick(entry) ?? 0), 0)
}

function costOf(entries) {
  let total = 0
  let priced = 0
  for (const entry of entries) {
    if (typeof entry.costUsd === 'number' && Number.isFinite(entry.costUsd)) { total += entry.costUsd; priced += 1 }
  }
  return priced === 0 ? null : total
}

/** Per-group descriptive statistics over the raw run records. */
export function aggregateGroups(runs) {
  const byGroup = new Map()
  for (const run of runs) {
    const key = run?.variant
    if (typeof key !== 'string') continue
    if (!byGroup.has(key)) byGroup.set(key, [])
    byGroup.get(key).push(run)
  }
  const groups = {}
  for (const [group, entries] of byGroup) {
    const graded = entries.filter((run) => !isInfrastructureFailure(run))
    const passed = graded.filter((run) => run.passed === true).length
    groups[group] = {
      sessions: entries.length,
      graded: graded.length,
      infrastructureFailures: entries.length - graded.length,
      passed,
      successRate: graded.length === 0 ? null : passed / graded.length,
      successInterval: wilsonInterval(passed, graded.length),
      uncachedInputTokens: sumOf(entries, (run) => run.usage?.uncachedInputTokens),
      outputTokens: sumOf(entries, (run) => run.usage?.outputTokens),
      cacheReadTokens: sumOf(entries, (run) => run.usage?.cacheReadTokens),
      totalTokens: sumOf(entries, (run) => run.usage?.totalTokens),
      durationMs: sumOf(entries, (run) => run.durationMs),
      toolCalls: sumOf(entries, (run) => run.toolCalls),
      toolErrors: sumOf(entries, (run) => run.toolErrors),
      humanInterventions: sumOf(entries, (run) => run.humanInterventions),
      approvalAsks: sumOf(entries, (run) => run.approvalsAsked),
      estimatedCostUsd: costOf(entries),
    }
  }
  return groups
}

/**
 * Paired per-task comparison of two groups: the paired unit is the task, and each
 * task contributes the difference between the two groups' pass rates over the
 * repetitions actually run.
 */
export function pairedComparison(runs, baselineGroup, candidateGroup) {
  const taskIds = [...new Set(runs.map((run) => run?.taskId).filter((id) => typeof id === 'string'))].sort()
  const perTask = []
  const deltas = []
  for (const taskId of taskIds) {
    const baseline = runs.filter((run) => run.variant === baselineGroup && run.taskId === taskId && !isInfrastructureFailure(run))
    const candidate = runs.filter((run) => run.variant === candidateGroup && run.taskId === taskId && !isInfrastructureFailure(run))
    if (baseline.length === 0 || candidate.length === 0) continue
    const baselineRate = baseline.filter((run) => run.passed === true).length / baseline.length
    const candidateRate = candidate.filter((run) => run.passed === true).length / candidate.length
    const delta = candidateRate - baselineRate
    deltas.push(delta)
    perTask.push({
      taskId,
      baselineRate,
      candidateRate,
      delta,
      baselineRuns: baseline.length,
      candidateRuns: candidate.length,
    })
  }
  const interval = meanConfidenceInterval(deltas)
  return {
    baseline: baselineGroup,
    candidate: candidateGroup,
    tasks: perTask.length,
    pairedMeanDelta: interval?.mean ?? null,
    // A difference of two rates cannot leave [-1, 1]; a tiny sample's t interval can.
    low: interval === null ? null : Math.max(-1, interval.low),
    high: interval === null ? null : Math.min(1, interval.high),
    sd: interval?.sd ?? null,
    perTask,
  }
}

/** The comparisons the improvement plan asks for, in attribution order. */
export function plannedComparisons(runs, baselineGroup = 'B') {
  const present = new Set(runs.map((run) => run.variant))
  const comparisons = []
  if (present.has(baselineGroup) && present.has('P')) comparisons.push(pairedComparison(runs, baselineGroup, 'P'))
  if (present.has('P') && present.has('T')) comparisons.push(pairedComparison(runs, 'P', 'T'))
  if (present.has('T') && present.has('N')) comparisons.push(pairedComparison(runs, 'T', 'N'))
  if (present.has(baselineGroup) && present.has('M')) comparisons.push(pairedComparison(runs, baselineGroup, 'M'))
  return comparisons
}

/** Every live-*.json run record in one results directory. */
export function loadRuns(dir) {
  const runs = []
  for (const name of readdirSync(dir)) {
    if (!name.startsWith('live-') || !name.endsWith('.json')) continue
    runs.push(JSON.parse(readFileSync(join(dir, name), 'utf8')))
  }
  return runs
}

/** Assemble the full report object from a results directory. */
export function buildReport(dir, baselineGroup = 'B') {
  const runs = loadRuns(dir)
  const suitePath = join(dir, 'suite.json')
  return {
    generatedAt: new Date().toISOString(),
    baselineGroup,
    baseline: runs[0]?.baseline ?? null,
    suite: existsSync(suitePath) ? JSON.parse(readFileSync(suitePath, 'utf8')) : null,
    groups: aggregateGroups(runs),
    comparisons: plannedComparisons(runs, baselineGroup),
    runs: runs.length,
  }
}

function percent(value) {
  return value === null || value === undefined ? 'n/a' : (value * 100).toFixed(1) + '%'
}

function interval(intervalValue) {
  return intervalValue === null || intervalValue === undefined ? 'n/a' : percent(intervalValue.low) + '..' + percent(intervalValue.high)
}

function signed(value) {
  if (value === null || value === undefined) return 'n/a'
  return (value >= 0 ? '+' : '') + (value * 100).toFixed(1) + 'pp'
}

/** Human-readable Markdown summary of one report object. */
export function renderMarkdown(report) {
  const lines = []
  lines.push('# LiangShen V4.1 Flash comparison report')
  lines.push('')
  lines.push('Generated: ' + report.generatedAt + ' from ' + report.runs + ' run record(s).')
  lines.push('')
  if (report.baseline !== null && report.baseline !== undefined) {
    const baseline = report.baseline
    lines.push('## Baseline')
    lines.push('')
    lines.push('| Fact | Value |')
    lines.push('| --- | --- |')
    lines.push('| Repository commit | ' + (baseline.repository?.commit ?? 'n/a') + ' |')
    lines.push('| Repository dirty | ' + JSON.stringify(baseline.repository?.dirty ?? null) + ' |')
    lines.push('| Shipped preset hash | ' + (baseline.presetSourceHash ?? 'n/a') + ' |')
    lines.push('| DSH version | ' + (baseline.dshVersion ?? 'n/a') + ' |')
    lines.push('| Route | ' + (baseline.route?.provider ?? '?') + '/' + (baseline.route?.model ?? '?') + '/' + (baseline.route?.reasoningEffort ?? '?') + ' |')
    lines.push('| Platform | ' + (baseline.platform ?? 'n/a') + ' / node ' + (baseline.node ?? '?') + ' |')
    lines.push('| Task revision | ' + (baseline.taskRevision === null || baseline.taskRevision === undefined ? 'n/a' : baseline.taskRevision.id + ' v' + baseline.taskRevision.version + ' (' + baseline.taskRevision.tasks + ' tasks, ' + baseline.taskRevision.hash.slice(0, 12) + ')') + ' |')
    if (report.suite !== null && report.suite !== undefined) {
      lines.push('| Stop reason | ' + report.suite.stopReason + ' after ' + report.suite.sessions + ' session(s) |')
    }
    lines.push('')
  }
  lines.push('## Group results')
  lines.push('')
  lines.push('| Group | Sessions | Graded | Passed | Success rate (95% CI) | Infra failures | Input tokens | Output tokens | Cache read | Tool calls | Tool errors | Interventions | Cost USD |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const group of GROUP_ORDER) {
    const stats = report.groups[group]
    if (stats === undefined) continue
    lines.push('| ' + [
      group,
      stats.sessions,
      stats.graded,
      stats.passed,
      percent(stats.successRate) + ' (' + interval(stats.successInterval) + ')',
      stats.infrastructureFailures,
      stats.uncachedInputTokens,
      stats.outputTokens,
      stats.cacheReadTokens,
      stats.toolCalls,
      stats.toolErrors,
      stats.humanInterventions,
      stats.estimatedCostUsd === null ? 'n/a' : stats.estimatedCostUsd.toFixed(4),
    ].join(' | ') + ' |')
  }
  lines.push('')
  lines.push('## Paired comparisons')
  lines.push('')
  lines.push('| Comparison | Purpose | Tasks paired | Mean delta (95% CI) |')
  lines.push('| --- | --- | --- | --- |')
  const purposes = {
    'B-P': 'isolates the persona change',
    'P-T': 'tests whether anchoring helps',
    'T-N': 'compares PTC against native presentation',
    'B-M': 'external reference, not single-factor attribution',
  }
  for (const comparison of report.comparisons) {
    const key = comparison.baseline + '-' + comparison.candidate
    const spread = comparison.pairedMeanDelta === null
      ? 'n/a'
      : signed(comparison.pairedMeanDelta) + ' (' + signed(comparison.low) + '..' + signed(comparison.high) + ')'
    lines.push('| ' + key + ' | ' + (purposes[key] ?? '') + ' | ' + comparison.tasks + ' | ' + spread + ' |')
  }
  lines.push('')
  lines.push('## Treatment notes')
  lines.push('')
  lines.push('- Infrastructure failures (timeout, or a session log with no request) are reported separately and excluded from every success-rate denominator.')
  lines.push('- Group M is the bundle-provided Minimal preset as an external reference; it is not a single-factor arm.')
  lines.push('- Group N is the full native roster, not Minimal and not a curated minimal toolset.')
  lines.push('- Language-style counters (we and let me) stay with tools/analyze-session.mjs and are not part of the outcome measures here.')
  lines.push('- A small sample screens a direction; it does not claim a stable improvement. Widen the sample within the stated budget before concluding.')
  lines.push('')
  return lines.join('\n')
}

function isMain() {
  const entry = process.argv[1]
  return entry !== undefined && pathToFileURL(entry).href === import.meta.url
}

if (isMain()) {
  const args = process.argv.slice(2)
  const positional = args.filter((arg) => !arg.startsWith('--'))
  const dir = positional[0]
  if (dir === undefined || !existsSync(dir)) {
    console.error('usage: node tools/benchmark-report.mjs <results-dir> [--baseline B]')
    process.exitCode = 1
  } else {
    const baselineIndex = args.indexOf('--baseline')
    const baselineGroup = baselineIndex === -1 ? 'B' : args[baselineIndex + 1]
    const report = buildReport(dir, baselineGroup)
    const markdown = renderMarkdown(report)
    writeFileSync(join(dir, 'report.json'), JSON.stringify(report, null, 2))
    writeFileSync(join(dir, 'report.md'), markdown)
    console.log(markdown)
  }
}
