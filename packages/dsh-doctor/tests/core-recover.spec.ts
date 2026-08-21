import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createMemoryFs, type FsLike } from '../src/core/fs.ts'
import { createYamlEngine } from '../src/core/yaml.ts'
import { createJournal } from '../src/core/journal.ts'
import { redactText } from '../src/core/redact.ts'
import { repairProfile, diagnoseAndPlan, rollbackTransaction, type RecoveryRequest } from '../src/core/recover.ts'
import type { GateDeps, ProcessClient, HttpClient, SpawnHandle } from '../src/core/gates.ts'

function fakeGates(script: { dumpStdout?: string; startStdout?: string; httpBody?: string; exit?: number }): { gates: GateDeps; spawned: string[][] } {
  const spawned: string[][] = []
  let pid = 1000
  const client: ProcessClient = {
    spawn(command: string[], opts: { cwd?: string; env?: Record<string, string | undefined> }): SpawnHandle {
      spawned.push([command.join(' '), (opts.env as any)?.DSH_HOME ?? '', (opts.env as any)?.DSH_TELEMETRY_DISABLED ?? ''])
      const isDump = command.includes('--dump-default-config')
      const stdout = isDump ? (script.dumpStdout ?? '[]\n') : (script.startStdout ?? 'dsh web: http://127.0.0.1:4567\n')
      const handle: SpawnHandle = {
        onStdout(cb) { queueMicrotask(() => cb(stdout)) },
        onStderr(cb) { queueMicrotask(() => cb('')) },
        onExit(cb) { queueMicrotask(() => cb(script.exit ?? 0, null)) },
        kill() {},
      }
      pid += 1
      void pid
      return handle
    },
  }
  const http: HttpClient = { async get() { return { status: 200, body: script.httpBody ?? '<html>window.__DSH_BOOT__</html>' } } }
  const gates = { client, http, engine: createYamlEngine(), redactText: (t: string) => redactText(t), clock: () => Date.now() }
  return { gates, spawned }
}

function request(fs: FsLike, home: string, extra: Partial<RecoveryRequest> = {}): RecoveryRequest {
  return { home, profile: 'web', dshPath: '/fake/dsh', fs, allowLive: true, now: () => '2026-01-01T00:00:00Z', clock: () => 1_700_000_000_000, pidAlive: () => true, ...extra }
}

describe('recovery orchestration', () => {
  it('heals a broken profile patch through stage, gates, promote, and commit', async () => {
    const fs = createMemoryFs()
    const home = '/h'
    await fs.mkdir(home + '/profiles/web', { recursive: true })
    await fs.writeText(home + '/profiles/web/package.json', JSON.stringify({ name: 'web', dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } } }))
    await fs.writeText(home + '/profiles/web/cordis.patch.yml', 'bad: [unclosed\n')
    const { gates, spawned } = fakeGates({})
    const outcome = await repairProfile({ ...request(fs, home), gate: gates }, { env: { HOME: '/u' } })
    expect(outcome.ok).toBe(true)
    expect(outcome.phase).toBe('promoted')
    expect(outcome.actions.length).toBeGreaterThan(0)
    expect(spawned.length).toBeGreaterThanOrEqual(2)
    const healed = await fs.readText(home + '/profiles/web/cordis.patch.yml')
    expect(healed).toContain('quarantined a broken patch')
    const journal = createJournal({ fs, file: home + '/.dsh-doctor/journal.jsonl', now: () => '2026-01-01T00:00:00Z' })
    const replay = await journal.replay()
    expect(replay.corrupted).toBe(0)
    expect(replay.entries.some(e => e.op === 'repair:commit')).toBe(true)
    const quarantineFile = fs.readdir(home + '/.dsh-doctor/quarantine/web').catch(() => [])
    expect(await quarantineFile.then(list => list.length)).toBeGreaterThan(0)
  })

  it('aborts and leaves the live profile untouched when the candidate fails gates', async () => {
    const fs = createMemoryFs()
    const home = '/h'
    await fs.mkdir(home + '/profiles/web', { recursive: true })
    await fs.writeText(home + '/profiles/web/package.json', JSON.stringify({ dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } }, name: 'web' }))
    await fs.writeText(home + '/profiles/web/cordis.patch.yml', 'bad: [unclosed\n')
    const { gates } = fakeGates({ exit: 1 })
    const outcome = await repairProfile({ ...request(fs, home), gate: gates })
    expect(outcome.ok).toBe(false)
    expect(outcome.phase).toBe('aborted')
    expect(await fs.readText(home + '/profiles/web/cordis.patch.yml')).toBe('bad: [unclosed\n')
    expect(await fs.exists(home + '/.dsh-doctor/quarantine/web')).toBe(false)
  })

  it('surfaces home-level repairs as manual actions without promoting', async () => {
    const fs = createMemoryFs()
    const home = '/h'
    await fs.mkdir(home + '/profiles/web', { recursive: true })
    await fs.writeText(home + '/profiles/web/package.json', JSON.stringify({ dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } }, name: 'web' }))
    await fs.writeText(home + '/profiles/web/cordis.patch.yml', '[]\n')
    await fs.writeText(home + '/cordis.patch.yml', 'bad: [unclosed\n')
    const outcome = await repairProfile({ ...request(fs, home), gate: fakeGates({}).gates })
    expect(outcome.ok).toBe(false)
    expect(outcome.phase).toBe('planned')
    expect(outcome.manualActions.length).toBeGreaterThan(0)
    expect(await fs.readText(home + '/cordis.patch.yml')).toBe('bad: [unclosed\n')
  })

  it('blocks when the caller does not assert the profile is stopped', async () => {
    const fs = createMemoryFs()
    const home = '/h'
    await fs.mkdir(home + '/profiles/web', { recursive: true })
    await fs.writeText(home + '/profiles/web/package.json', '{}')
    const outcome = await repairProfile({ ...request(fs, home), allowLive: false, gate: fakeGates({}).gates })
    expect(outcome.ok).toBe(false)
    expect(outcome.phase).toBe('blocked')
  })

  it('diagnoses without promoting a healthy profile', async () => {
    const fs = createMemoryFs()
    const home = '/h'
    await fs.mkdir(home + '/profiles/web', { recursive: true })
    await fs.writeText(home + '/profiles/web/package.json', JSON.stringify({ dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } }, name: 'web' }))
    await fs.writeText(home + '/profiles/web/cordis.patch.yml', '[]\n')
    const outcome = await diagnoseAndPlan(request(fs, home))
    expect(outcome.phase).toBe('noop')
    expect(outcome.ok).toBe(true)
  })

  it('rolls back a committed transaction from its record', async () => {
    const fs = createMemoryFs()
    const home = '/h'
    await fs.mkdir(home + '/profiles/web', { recursive: true })
    await fs.writeText(home + '/profiles/web/package.json', JSON.stringify({ dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } }, name: 'web' }))
    await fs.writeText(home + '/profiles/web/cordis.patch.yml', 'bad: [unclosed\n')
    const outcome = await repairProfile({ ...request(fs, home), gate: fakeGates({}).gates })
    expect(outcome.phase).toBe('promoted')
    const rolled = await rollbackTransaction({ ...request(fs, home) }, outcome.txnId!)
    expect(rolled.ok).toBe(true)
    expect(await fs.readText(home + '/profiles/web/cordis.patch.yml')).toBe('bad: [unclosed\n')
  })
})

describe('recovery filesystem isolation', () => {
  it('uses real nodeFs against a temp directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-doctor-recover-'))
    try {
      const fs = (await import('../src/core/fs.ts')).nodeFs as FsLike
      await fs.mkdir(dir + '/profiles/web', { recursive: true })
      await fs.writeText(dir + '/profiles/web/package.json', JSON.stringify({ dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } }, name: 'web' }))
      await fs.writeText(dir + '/profiles/web/cordis.patch.yml', '[]\n')
      const outcome = await diagnoseAndPlan(request(fs, dir))
      expect(outcome.phase).toBe('noop')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
