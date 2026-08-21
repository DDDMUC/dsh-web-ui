import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { provisionCapsule, type CapsuleOptions } from '../src/agent/capsule.ts'

describe('rescue capsule provisioning', () => {
  it('provisions, verifies and swaps current with previous', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-doctor-capsule-'))
    try {
      const calls: string[][] = []
      const run: CapsuleOptions['run'] = async (command, args, env) => {
        calls.push([command, ...args])
        if (command === 'dsh' && args[0] === '--version') return { code: 0, stdout: '0.1.1-rc.2\n', stderr: '' }
        if (args[0] === 'plugin' && args[1] === '--profile') return { code: 0, stdout: '', stderr: '' }
        if (args.includes('--dump-config')) return { code: 0, stdout: 'rows:\n  - id: doctor\n', stderr: '' }
        if (!args.includes('--dump-config')) return { code: 0, stdout: '', stderr: '' }
        return { code: 0, stdout: '', stderr: '' }
      }
      const manifest = await provisionCapsule({
        paths: {
          root: dir, state: join(dir, 'state'), registry: join(dir, 'registry'), incidents: join(dir, 'incidents'),
          snapshots: join(dir, 'snapshots'), candidates: join(dir, 'candidates'), quarantine: join(dir, 'quarantine'),
          capsule: join(dir, 'capsule'), logs: join(dir, 'logs'), socket: join(dir, 's.sock'), token: join(dir, 't.ok'),
        },
        dshExecutable: 'dsh',
        doctorSpec: '@linxin666/dsh-doctor@0.2.7',
        run,
        now: () => '2026-01-01T00:00:00Z',
      })
      expect(manifest.status).toBe('verified')
      expect(manifest.dshVersion).toBe('0.1.1-rc.2')
      expect(calls.some(c => c[0] === 'dsh' && c.includes('plugin'))).toBe(true)
      expect(calls.some(c => c.includes('--dump-config'))).toBe(true)
      const saved = JSON.parse(await readFile(join(dir, 'capsule', 'current', 'manifest.json'), 'utf8')) as typeof manifest
      expect(saved.rescueHome).toContain('/current')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('fails loud when the rescue Doctor cannot be installed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-doctor-capsule-'))
    try {
      const run: CapsuleOptions['run'] = async (command, args) => {
        if (command === 'dsh' && args[0] === '--version') return { code: 0, stdout: '0.1.1-rc.2\n', stderr: '' }
        return { code: 1, stdout: '', stderr: 'pnpm install failed' }
      }
      await expect(provisionCapsule({
        paths: {
          root: dir, state: join(dir, 'state'), registry: join(dir, 'registry'), incidents: join(dir, 'incidents'),
          snapshots: join(dir, 'snapshots'), candidates: join(dir, 'candidates'), quarantine: join(dir, 'quarantine'),
          capsule: join(dir, 'capsule'), logs: join(dir, 'logs'), socket: '', token: '',
        },
        dshExecutable: 'dsh', doctorSpec: '@linxin666/dsh-doctor@0.2.7', run,
      })).rejects.toThrow(/rescue Doctor install failed/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
