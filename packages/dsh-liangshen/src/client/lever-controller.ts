/**
 * Lever controller: the business face behind the homepage lever.
 *
 * The view stays pure; every fact and verb comes from here. The roster arrives
 * over the agent-preset Remote namespace (the same one the official surfaces
 * read), the current session comes from the browser sessions service, and the
 * switch goes through `agentPresets.select`, which the host accepts only while
 * the session is still blank.
 *
 * Nothing is cached across reloads except in memory: the lever reads the
 * session's `agentPreset` projection, so a page reload still shows the true
 * state, while `previous` (the preset a push-up restores) is remembered for
 * the length of the page visit and otherwise falls back to the deployment
 * default.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { AgentPresetRoster } from '@deepseek-ai/dsh-agent-presets/types'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { LIANGSHEN_PRESET_ID, isActionable, leverState, restoreTarget, type LeverFacts, type LeverState } from '../core/lever.ts'
import type { LiangShenKey } from './locales.ts'

/**
 * Why the last switch was refused, mapped from the Remote failure code so the
 * view can render localized copy instead of a host message.
 */
export type LeverError =
  /** The session already started; its composition is fixed. */
  | { kind: 'locked' }
  /** The deployment supplies no such preset. */
  | { kind: 'missing' }
  /** Anything else, carrying the host's own reason. */
  | { kind: 'failed'; reason: string }

/** What the lever view renders. */
export interface LeverSnapshot {
  /** Resolved lever state. */
  state: LeverState
  /** Display name of the preset a push-up restores; empty when there is none. */
  restoreLabel: string
  /** A switch is in flight. */
  busy: boolean
  /** The last refusal, cleared by the next attempt. */
  error?: LeverError
  /** Increments when a pull-down landed, so the view replays the burst once. */
  burst: number
}

/**
 * The two agent-preset Remote calls this plugin makes. Spelled locally: the
 * generated namespace merge belongs to the SDK's own client packages, and this
 * browser bundle only needs the two members it calls.
 */
export interface AgentPresetRemote {
  list(): Promise<RemoteResult<AgentPresetRoster>>
  select(sessionId: string, agentPreset: string): Promise<RemoteResult<string>>
}

/** The injected face the lever view consumes. */
export interface LeverFace {
  /** The snapshot store the view subscribes to. */
  store: SnapshotStore<LeverSnapshot>
  /** Pull the lever down: turn LiangShen mode on. */
  pull: () => void
  /** Push the lever up: restore the previous preset. */
  push: () => void
  /** Translate one lever key. */
  t: (key: LiangShenKey, vars?: Record<string, string | number>) => string
}

/** Read the preset a session summary reports, when it reports one. */
function presetOf(session: { projectionValues?: Record<string, unknown> } | undefined): string | undefined {
  const value = session?.projectionValues?.['agentPreset']
  return typeof value === 'string' ? value : undefined
}

/** The lever controller: roster read, session facts, and the preset switch. */
export class LeverController {
  private readonly store: SnapshotStore<LeverSnapshot>

  private readonly sessions: ISessions

  private readonly remote: AgentPresetRemote

  /** Roster rows as last read; empty until the first read lands. */
  private rows: AgentPresetRoster['presets'] = []

  /** The preset the user was on before the last pull-down. */
  private previous: string | undefined

  private loading = false

  private readonly disposers: (() => void)[] = []

  constructor(private readonly ctx: ClientContext) {
    this.sessions = ctx.sessions as unknown as ISessions
    this.remote = (ctx as unknown as { remote: { agentPresets: AgentPresetRemote } }).remote.agentPresets
    this.store = createSnapshotStore<LeverSnapshot>({
      state: 'off',
      restoreLabel: '',
      busy: false,
      burst: 0,
    })
  }

  /** The snapshot store the view subscribes to. */
  snapshot(): SnapshotStore<LeverSnapshot> {
    return this.store
  }

  /** Follow the roster and the current session, then read the roster once. */
  start(): void {
    this.disposers.push(this.sessions.list.subscribe(() => { this.refresh() }))
    this.disposers.push(this.ctx.remote.$on('settings/document-updated', (ns: string) => {
      if (ns === 'agent-presets') void this.load()
    }))
    this.refresh()
    void this.load()
  }

  /** Release every subscription. Idempotent. */
  dispose(): void {
    for (const dispose of this.disposers.splice(0)) dispose()
  }

  /** The inject face handed to the slot entry. */
  face(): LeverFace {
    return {
      store: this.store,
      pull: () => { void this.toggle('down') },
      push: () => { void this.toggle('up') },
      t: (key, vars) => this.ctx.locale.bind('liangshen')(key, vars),
    }
  }

  /** Read the roster; a refusal leaves the lever as it was. */
  async load(): Promise<void> {
    if (this.loading) return
    this.loading = true
    try {
      const result = await this.remote.list()
      if (result.ok) this.rows = result.value.presets
    } catch {
      // A carrier failure leaves the roster empty; the view reports `missing`.
    } finally {
      this.loading = false
      this.refresh()
    }
  }

  /**
   * Recompute the snapshot from the current session and the last roster read.
   * Only the derived fields are written: an in-flight switch, the last refusal,
   * and the burst counter belong to the gesture, not to a session refresh.
   */
  refresh(): void {
    const facts = this.facts()
    const snapshot = this.store.getSnapshot()
    const state = leverState(facts)
    const target = restoreTarget(facts)
    const restoreLabel = target === undefined ? '' : this.labelOf(target)
    if (snapshot.state === state && snapshot.restoreLabel === restoreLabel) return
    this.store.set({ ...snapshot, state, restoreLabel })
  }

  /** The verb behind one gesture direction. */
  private async toggle(direction: 'down' | 'up'): Promise<void> {
    const snapshot = this.store.getSnapshot()
    if (snapshot.busy) return
    const facts = this.facts()
    if (!isActionable(leverState(facts))) return
    const target = direction === 'down' ? LIANGSHEN_PRESET_ID : restoreTarget(facts)
    const sessionId = this.currentSessionId()
    if (target === undefined || sessionId === undefined) return
    if (facts.agentPreset === target) {
      // Already there: a gesture on the current state is a no-op, not a switch.
      this.refresh()
      return
    }
    this.store.set({ ...snapshot, busy: true, error: undefined })
    let result: RemoteResult<string>
    try {
      result = await this.remote.select(sessionId, target)
    } catch (error) {
      this.store.set({ ...this.store.getSnapshot(), busy: false, error: { kind: 'failed', reason: message(error) } })
      return
    }
    if (!result.ok) {
      this.store.set({ ...this.store.getSnapshot(), busy: false, error: refusal(result.error) })
      this.refresh()
      return
    }
    // The switch landed: remember where to return, then celebrate only the
    // pull that turned the mode on.
    this.previous = direction === 'down' ? facts.agentPreset : undefined
    const next = this.store.getSnapshot()
    this.store.set({ ...next, busy: false, error: undefined, burst: direction === 'down' ? next.burst + 1 : next.burst })
    this.refresh()
  }

  /** The facts one decision reads, from the live session and the roster. */
  private facts(): LeverFacts {
    const summary = this.currentSession()
    const available = this.rows.filter(row => row.broken === undefined).map(row => row.id)
    const fallback = this.rows.find(row => row.isDefault)?.id
    return {
      blank: summary?.blank === true,
      agentPreset: presetOf(summary),
      available,
      fallback,
      previous: this.previous,
    }
  }

  private currentSessionId(): string | undefined {
    const current = this.sessions.list.getSnapshot().current
    return current === undefined ? undefined : String(current)
  }

  private currentSession(): { blank?: boolean, projectionValues?: Record<string, unknown> } | undefined {
    const state = this.sessions.list.getSnapshot()
    const current = state.current
    if (current === undefined) return undefined
    return state.byId[current] as unknown as { blank?: boolean, projectionValues?: Record<string, unknown> } | undefined
  }

  /** Display name of one preset id, falling back to the id itself. */
  private labelOf(id: string): string {
    const row = this.rows.find(candidate => candidate.id === id)
    return row?.name ?? id
  }
}

/** The host's own reason for a refusal, mapped to lever copy. */
function refusal(error: { code?: string, message?: string, details?: unknown }): LeverError {
  if (error.code === 'agent-preset/locked') return { kind: 'locked' }
  if (error.code === 'agent-preset/not-found') return { kind: 'missing' }
  const details = error.details
  if (typeof details === 'object' && details !== null && typeof (details as { reason?: unknown }).reason === 'string') {
    return { kind: 'failed', reason: (details as { reason: string }).reason }
  }
  return { kind: 'failed', reason: error.message ?? error.code ?? 'unknown' }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
