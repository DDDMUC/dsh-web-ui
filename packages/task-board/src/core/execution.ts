/**
 * Execution service: runs a task through dsh's real session machinery.
 *
 * The board's "run" button must make dsh actually work, not fake a status:
 * the service connects a real session (workspace blank-session reuse or
 * `session.create` on the host via the workspaces service), renames it to
 * the task title, sends the task prompt with `session.prompt`, and then
 * watches the session's conversation snapshot until its turn settles. The
 * task board controller consumes {@link ExecutionEvent}s to move the card
 * running → done/failed and to keep the execution record.
 *
 * Deliberately framework-free: the runtime faces are declared structurally
 * (a narrow slice of the real `ctx.sessions` / `ctx.workspaces` contracts)
 * so tests drive it with plain fakes.
 */
import type { ExecutionRecord, TaskRecord } from './tasks.ts'

/** The narrow sessions face the service needs. */
export interface SessionsExecutionFace {
  list: {
    getSnapshot(): {
      /** Baseline arrival lifecycle — 'pending' until the host list has loaded. */
      phase: 'pending' | 'ready'
      byId: Record<string, { running: boolean; completed?: boolean }>
    }
    subscribe(fn: () => void): () => void
  }
  binding(id: string): { session: SessionDriver } | undefined
}

/** The narrow workspaces face the service needs. */
export interface WorkspacesExecutionFace {
  list: {
    getSnapshot(): {
      items: readonly { workspaceId: string }[]
      recentWorkspaceId: string | undefined
    }
  }
  connectWorkspace(workspaceId: string): Promise<string>
}

/** The behavior verbs the service invokes on an execution session. */
export interface SessionDriver {
  rename(title: string): Promise<unknown>
  prompt(
    content: readonly unknown[],
    mode: 'queue',
  ): Promise<{ ok: true } | { ok: false; error: unknown }>
  getSnapshot(): { running: boolean; lastAgentError: string | null; turnEnds: ReadonlyMap<number, number> }
  subscribe(fn: () => void): () => void
}

/** Everything the service needs from the runtime. */
export interface ExecutionEnvironment {
  sessions: SessionsExecutionFace
  workspaces: WorkspacesExecutionFace
}

/** Outcome events the service emits to the controller. */
export type ExecutionEvent =
  | { kind: 'started'; taskId: string; executionId: string; sessionId: string }
  | { kind: 'settled'; taskId: string; executionId: string; outcome: 'succeeded' | 'failed' | 'cancelled'; error?: string }

/** Human copy for a run failure. */
function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * Run one task to completion (or to a settled failure).
 *
 * @param task - the task being executed.
 * @param execution - the freshly opened execution record (id + start time).
 * @param onEvent - callback for started/settled events.
 * @returns resolves when the run settles (or fails to start); never rejects —
 *   every failure path is reported as a settled event.
 */
export class ExecutionService {
  /** @param env - the runtime faces (real or fake). */
  constructor(private readonly env: ExecutionEnvironment) {}

  async run(
    task: TaskRecord,
    execution: ExecutionRecord,
    onEvent: (event: ExecutionEvent) => void,
  ): Promise<void> {
    try {
      const sessionId = await this.connectSession()
      onEvent({ kind: 'started', taskId: task.id, executionId: execution.id, sessionId })
      const driver = this.driverOf(sessionId)
      if (driver === undefined) {
        onEvent({ kind: 'settled', taskId: task.id, executionId: execution.id, outcome: 'failed', error: 'execution session is not ready' })
        return
      }
      // Best-effort rename so the execution is recognizable in the session list.
      await driver.rename(task.title).catch(() => { /* rename is cosmetic */ })
      const accepted = await this.sendPrompt(driver, task)
      if (!accepted.ok) {
        onEvent({
          kind: 'settled', taskId: task.id, executionId: execution.id, outcome: 'failed',
          error: messageOf(accepted.error),
        })
        return
      }
      this.watchForSettlement(driver, task.id, execution.id, onEvent)
    } catch (error) {
      onEvent({
        kind: 'settled', taskId: task.id, executionId: execution.id, outcome: 'failed',
        error: messageOf(error),
      })
    }
  }

  /**
   * Inspect a reloaded/background task that was left 'running' and emit a
   * settled event when its session already finished.
   *
   * A session that was never opened keeps a cold conversation snapshot (the
   * runtime only maintains the window for the staged/current session), so the
   * settled outcome is decided by the strongest available signal, in order:
   * 1. the list summary — missing session → cancelled; still running → pending;
   * 2. a warm conversation snapshot → `lastAgentError` decides failed/succeeded;
   * 3. otherwise a finished session counts as succeeded.
   *
   * @param task - a task whose latest execution has no endedAt.
   * @returns a settled event when the session state proves completion, else undefined.
   */
  async reconcile(task: TaskRecord): Promise<ExecutionEvent | undefined> {
    const execution = task.executions[task.executions.length - 1]
    if (execution === undefined || execution.sessionId === undefined || execution.endedAt !== undefined) return undefined
    const list = this.env.sessions.list.getSnapshot()
    // The host list baseline has not arrived yet (page load): a session "not
    // found" now would be a false cancel. Wait for a later list change.
    if (list.phase !== 'ready') return undefined
    const summary = list.byId[execution.sessionId]
    if (summary === undefined) {
      return { kind: 'settled', taskId: task.id, executionId: execution.id, outcome: 'cancelled', error: 'execution session no longer exists' }
    }
    if (summary.running) return undefined
    const driver = this.driverOf(execution.sessionId)
    if (driver !== undefined) {
      const snapshot = driver.getSnapshot()
      if (snapshot.turnEnds.size > 0) {
        const outcome = snapshot.lastAgentError !== null ? 'failed' : 'succeeded'
        return {
          kind: 'settled', taskId: task.id, executionId: execution.id, outcome,
          error: snapshot.lastAgentError ?? undefined,
        }
      }
    }
    return { kind: 'settled', taskId: task.id, executionId: execution.id, outcome: 'succeeded' }
  }

  private async connectSession(): Promise<string> {
    const workspace = this.env.workspaces.list.getSnapshot()
    const workspaceId = workspace.recentWorkspaceId ?? workspace.items[0]?.workspaceId
    if (workspaceId === undefined) {
      throw new Error('no workspace available to run the task in')
    }
    return this.env.workspaces.connectWorkspace(workspaceId)
  }

  private driverOf(sessionId: string): SessionDriver | undefined {
    return this.env.sessions.binding(sessionId)?.session
  }

  private async sendPrompt(
    driver: SessionDriver,
    task: TaskRecord,
  ): Promise<{ ok: true } | { ok: false; error: unknown }> {
    const text = task.prompt.trim() !== '' ? task.prompt : task.title
    try {
      const result = await driver.prompt([{ type: 'text', text }], 'queue')
      return result
    } catch (error) {
      return { ok: false, error }
    }
  }

  /**
   * Subscribe to the execution session and settle the run once the accepted
   * turn completes (turn counter advanced past the acceptance baseline and
   * the session is no longer running). Never settles while the session is
   * still running; unsubscribes on settle.
   */
  private watchForSettlement(
    driver: SessionDriver,
    taskId: string,
    executionId: string,
    onEvent: (event: ExecutionEvent) => void,
  ): void {
    const baseline = driver.getSnapshot().turnEnds.size
    let settled = false
    const unsubscribe = driver.subscribe(() => {
      if (settled) return
      const snapshot = driver.getSnapshot()
      if (snapshot.running || snapshot.turnEnds.size <= baseline) return
      settled = true
      unsubscribe()
      onEvent({
        kind: 'settled', taskId, executionId,
        outcome: snapshot.lastAgentError !== null ? 'failed' : 'succeeded',
        error: snapshot.lastAgentError ?? undefined,
      })
    })
  }
}
