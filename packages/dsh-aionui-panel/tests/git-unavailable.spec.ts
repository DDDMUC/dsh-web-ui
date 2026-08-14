/**
 * Regression tests for the missing-git-binary degradation (issue: the SSE git
 * poll re-spawned ENOENT every 2 seconds and spammed the terminal forever):
 * - The poll probes git availability once and stops polling when the binary
 *   is missing, pushing exactly one gitUnavailable SSE event per connection.
 * - Machines with git installed keep the normal polling behavior.
 * - GitService caches the probe verdict so status() answers null without
 *   spawning anything on a git-less machine.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerPanelRoutes } from '../src/host/routes.ts'
import { GitService, type GitRunner } from '../src/host/git-service.ts'
import type { WorkspaceGate } from '../src/host/gate.ts'

/** One SSE connection with the bytes the host pushed. */
interface Connection {
  writes: string[]
  close: () => void
}

/** A minimal ctx/webServer/fs/git harness for registerPanelRoutes. */
function makeEnv(): {
  sse: (req: unknown, res: unknown) => Promise<void>
  git: { gitAvailable: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> }
  warn: ReturnType<typeof vi.fn>
} {
  const warn = vi.fn()
  const registrations: Array<{ kind: string; path: string; handler: (req: unknown, res: unknown) => Promise<void> }> = []
  const ctx = {
    logger: { warn },
    webServer: {
      register: (row: { kind: string; path: string; handler: (req: unknown, res: unknown) => Promise<void> }) => {
        registrations.push(row)
        return () => {}
      },
    },
  }
  const fs = {
    verify: async (root: string) => ({ ok: true, canonical: root }),
    watch: (_root: string, _onChange: () => void) => () => {},
  }
  const git = {
    gitAvailable: vi.fn(async () => true),
    status: vi.fn(async () => null),
  }
  registerPanelRoutes(ctx as never, fs as never, git as never)
  const row = registrations.find((item) => item.kind === 'exact')
  if (row === undefined) throw new Error('SSE route not registered')
  return { sse: row.handler, git, warn }
}

/** Open one SSE connection and collect everything the host writes to it. */
async function connect(sse: (req: unknown, res: unknown) => Promise<void>, root: string): Promise<Connection> {
  const writes: string[] = []
  const closeHandlers: Array<() => void> = []
  const res = {
    writeHead: () => {},
    write: (chunk: unknown) => { writes.push(String(chunk)) },
    end: () => {},
  }
  const req = {
    url: '/aionui-panel/events?root=' + encodeURIComponent(root),
    on: (event: string, handler: () => void) => {
      if (event === 'close') closeHandlers.push(handler)
    },
  }
  await sse(req, res)
  return {
    writes,
    close: () => {
      for (const handler of closeHandlers) handler()
    },
  }
}

/** Count pushes of one event kind in the collected SSE bytes. */
function eventsOfKind(writes: string[], kind: string): number {
  return writes.filter((write) => write.includes('"kind":"' + kind + '"')).length
}

describe('SSE git polling with a missing git binary', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('probes once, pushes one gitUnavailable event, and stops polling', async () => {
    const env = makeEnv()
    env.git.gitAvailable.mockResolvedValue(false)
    const conn = await connect(env.sse, '/w')

    await vi.advanceTimersByTimeAsync(2_000)

    expect(env.git.gitAvailable).toHaveBeenCalledTimes(1)
    expect(eventsOfKind(conn.writes, 'gitUnavailable')).toBe(1)
    expect(env.warn).toHaveBeenCalledTimes(1)
    expect(env.git.status).not.toHaveBeenCalled()

    // Thirty more ticks: still exactly one event, no status spawns, no logs.
    await vi.advanceTimersByTimeAsync(60_000)

    expect(eventsOfKind(conn.writes, 'gitUnavailable')).toBe(1)
    expect(env.warn).toHaveBeenCalledTimes(1)
    expect(env.git.gitAvailable).toHaveBeenCalledTimes(1)
    expect(env.git.status).not.toHaveBeenCalled()

    conn.close()
  })

  it('pushes gitUnavailable to connections opened after the probe failed', async () => {
    const env = makeEnv()
    env.git.gitAvailable.mockResolvedValue(false)
    const first = await connect(env.sse, '/w')
    await vi.advanceTimersByTimeAsync(2_000)
    const second = await connect(env.sse, '/w')

    expect(eventsOfKind(first.writes, 'gitUnavailable')).toBe(1)
    expect(eventsOfKind(second.writes, 'gitUnavailable')).toBe(1)
    expect(env.git.gitAvailable).toHaveBeenCalledTimes(1)

    first.close()
    second.close()
  })
})

describe('SSE git polling with git installed', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('keeps polling and pushing status changes', async () => {
    const env = makeEnv()
    const status = { root: '/w', branch: 'main', staged: [], unstaged: [], untracked: [] }
    env.git.status.mockResolvedValue(status)
    const conn = await connect(env.sse, '/w')

    await vi.advanceTimersByTimeAsync(2_000)
    expect(env.git.gitAvailable).toHaveBeenCalledTimes(1)
    expect(env.git.status).toHaveBeenCalledTimes(1)
    expect(eventsOfKind(conn.writes, 'git')).toBe(1)

    // Unchanged status pushes nothing; a branch change pushes again.
    await vi.advanceTimersByTimeAsync(2_000)
    expect(env.git.status).toHaveBeenCalledTimes(2)
    expect(eventsOfKind(conn.writes, 'git')).toBe(1)
    expect(eventsOfKind(conn.writes, 'gitUnavailable')).toBe(0)

    env.git.status.mockResolvedValue({ ...status, branch: 'dev' })
    await vi.advanceTimersByTimeAsync(2_000)
    expect(env.git.status).toHaveBeenCalledTimes(3)
    expect(eventsOfKind(conn.writes, 'git')).toBe(2)
    expect(eventsOfKind(conn.writes, 'gitUnavailable')).toBe(0)

    conn.close()
  })
})

describe('GitService availability probe', () => {
  const gate: WorkspaceGate = async (root) => ({ ok: true, canonical: root })

  function enoentRunner(calls: string[][]): GitRunner {
    return {
      async run(argv) {
        calls.push([...argv])
        return { exitCode: 127, stdout: '', stderr: 'spawn ENOENT' }
      },
    }
  }

  it('probes git --version once and caches the verdict', async () => {
    const calls: string[][] = []
    const service = new GitService(enoentRunner(calls), gate, vi.fn())

    expect(await service.gitAvailable()).toBe(false)
    expect(await service.gitAvailable()).toBe(false)
    expect(calls.filter((call) => call[0] === '--version')).toHaveLength(1)
  })

  it('status returns null without spawning git when the binary is missing', async () => {
    const calls: string[][] = []
    const service = new GitService(enoentRunner(calls), gate, vi.fn())

    expect(await service.status('/w')).toBeNull()
    expect(await service.status('/w')).toBeNull()
    expect(calls.filter((call) => call[0] === '--version')).toHaveLength(1)
    expect(calls.some((call) => call[0] === 'rev-parse')).toBe(false)
  })
})
