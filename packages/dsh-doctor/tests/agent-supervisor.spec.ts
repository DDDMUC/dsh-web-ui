import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DOCTOR_PROTOCOL_VERSION, type SupervisorRequest } from '../src/core/protocol.ts'
import { DoctorSupervisor } from '../src/agent/supervisor.ts'
import { doctorPaths } from '../src/agent/paths.ts'
import { callSupervisor } from '../src/agent/ipc.ts'

describe('DoctorSupervisor', () => {
  it('starts, authorizes only the install token, and serves status', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-doctor-sup-'))
    const paths = doctorPaths({ DSH_DOCTOR_HOME: dir })
    const supervisor = new DoctorSupervisor({ paths, version: '0.2.7' })
    await supervisor.start()
    try {
      const token = (await readFile(paths.token, 'utf8')).trim()
      expect(token).toMatch(/^[0-9a-f]{64}$/)
      expect((await stat(paths.token)).mode & 0o777).toBe(0o600)
      const denied = await callSupervisor(paths.socket, 'wrong', { protocol: DOCTOR_PROTOCOL_VERSION, type: 'status' })
      expect(denied.ok).toBe(false)
      expect(denied.error?.code).toBe('UNAUTHORIZED')
      const ok = await callSupervisor(paths.socket, token, { protocol: DOCTOR_PROTOCOL_VERSION, type: 'status' })
      expect(ok.ok).toBe(true)
      expect(ok.snapshot?.phase).toBe('armed')
      expect(ok.snapshot?.protocol).toBe(DOCTOR_PROTOCOL_VERSION)
      expect(ok.snapshot?.profiles).toEqual([])
    } finally {
      await supervisor.stop()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('classifies crashes, opens incidents, and quarantines after the window', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-doctor-sup-'))
    const paths = doctorPaths({ DSH_DOCTOR_HOME: dir })
    const supervisor = new DoctorSupervisor({ paths })
    await supervisor.start()
    try {
      const base: SupervisorRequest = { protocol: DOCTOR_PROTOCOL_VERSION, type: 'launcher-start', profile: { id: 'p1', dshHome: '/home/u/.dsh', name: 'web', dshExecutable: '/usr/bin/dsh', role: 'protected' }, runId: 'r1', pid: 42, argv: ['dsh', 'web'], at: '2026-01-01T00:00:00Z' }
      await supervisor.handle(base)
      let snap = (await supervisor.handle({ protocol: DOCTOR_PROTOCOL_VERSION, type: 'status' })).snapshot!
      expect(snap.profiles[0]?.phase).toBe('starting')
      await supervisor.handle({ protocol: DOCTOR_PROTOCOL_VERSION, type: 'heartbeat', profileId: 'p1', runId: 'r1', pid: 42, phase: 'ready', at: '2026-01-01T00:00:02Z' })
      snap = (await supervisor.handle({ protocol: DOCTOR_PROTOCOL_VERSION, type: 'status' })).snapshot!
      expect(snap.profiles[0]?.phase).toBe('healthy')
      await supervisor.handle({ protocol: DOCTOR_PROTOCOL_VERSION, type: 'launcher-exit', profileId: 'p1', runId: 'r1', exitCode: 1, signal: null, intentional: false, started: true, at: '2026-01-01T00:00:03Z' })
      snap = (await supervisor.handle({ protocol: DOCTOR_PROTOCOL_VERSION, type: 'status' })).snapshot!
      expect(snap.profiles[0]?.phase).toBe('failed')
      expect(snap.incidents[0]?.kind).toBe('process-crash')
      expect(snap.profiles[0]?.restartCount).toBe(1)
      await supervisor.handle({ protocol: DOCTOR_PROTOCOL_VERSION, type: 'launcher-start', profile: { id: 'p1', dshHome: '/home/u/.dsh', name: 'web', dshExecutable: '/usr/bin/dsh', role: 'protected' }, runId: 'r2', pid: 43, argv: ['dsh', 'web'], at: '2026-01-01T00:05:00Z' })
      await supervisor.handle({ protocol: DOCTOR_PROTOCOL_VERSION, type: 'launcher-exit', profileId: 'p1', runId: 'r2', exitCode: 1, signal: null, intentional: false, started: false, at: '2026-01-01T00:05:10Z' })
      snap = (await supervisor.handle({ protocol: DOCTOR_PROTOCOL_VERSION, type: 'status' })).snapshot!
      expect(snap.profiles[0]?.restartCount).toBe(2)
      expect(snap.profiles[0]?.phase).toBe('quarantined')
      expect(snap.incidents[0]?.kind).toBe('process-crash')
      expect(snap.incidents[0]?.evidence.length).toBeGreaterThanOrEqual(2)
    } finally {
      await supervisor.stop()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('keeps user stops and headless task completions silent', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-doctor-sup-'))
    const paths = doctorPaths({ DSH_DOCTOR_HOME: dir })
    const supervisor = new DoctorSupervisor({ paths })
    await supervisor.start()
    try {
      await supervisor.handle({ protocol: DOCTOR_PROTOCOL_VERSION, type: 'launcher-start', profile: { id: 'p2', dshHome: '/h', name: 'headless', dshExecutable: '/d', role: 'protected' }, runId: 'r9', pid: 9, argv: ['dsh', '--profile', 'headless', 'x'], at: '2026-01-01T00:00:00Z' })
      await supervisor.handle({ protocol: DOCTOR_PROTOCOL_VERSION, type: 'launcher-exit', profileId: 'p2', runId: 'r9', exitCode: 0, signal: null, intentional: false, started: true, at: '2026-01-01T00:00:05Z' })
      let snap = (await supervisor.handle({ protocol: DOCTOR_PROTOCOL_VERSION, type: 'status' })).snapshot!
      expect(snap.incidents).toEqual([])
      await supervisor.handle({ protocol: DOCTOR_PROTOCOL_VERSION, type: 'launcher-start', profile: { id: 'p3', dshHome: '/h', name: 'web', dshExecutable: '/d', role: 'protected' }, runId: 'r10', pid: 10, argv: ['dsh', 'web'], at: '2026-01-01T00:01:00Z' })
      await supervisor.handle({ protocol: DOCTOR_PROTOCOL_VERSION, type: 'launcher-exit', profileId: 'p3', runId: 'r10', exitCode: 130, signal: 'SIGINT', intentional: true, started: true, at: '2026-01-01T00:01:03Z' })
      snap = (await supervisor.handle({ protocol: DOCTOR_PROTOCOL_VERSION, type: 'status' })).snapshot!
      expect(snap.profiles.find(p => p.identity.id === 'p3')?.phase).toBe('exited')
      expect(snap.incidents).toEqual([])
    } finally {
      await supervisor.stop()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('opens a client-failure incident and honors pause and resume', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-doctor-sup-'))
    const paths = doctorPaths({ DSH_DOCTOR_HOME: dir })
    const supervisor = new DoctorSupervisor({ paths })
    await supervisor.start()
    try {
      await supervisor.handle({ protocol: DOCTOR_PROTOCOL_VERSION, type: 'client-failure', profileId: 'p4', at: '2026-01-01T00:00:00Z', message: 'React mount failed', phase: 'REACT_MOUNTED' })
      let snap = (await supervisor.handle({ protocol: DOCTOR_PROTOCOL_VERSION, type: 'status' })).snapshot!
      expect(snap.incidents[0]?.kind).toBe('client-failure')
      const incidentId = snap.incidents[0]!.id
      await supervisor.handle({ protocol: DOCTOR_PROTOCOL_VERSION, type: 'action', action: 'diagnose', incidentId })
      snap = (await supervisor.handle({ protocol: DOCTOR_PROTOCOL_VERSION, type: 'status' })).snapshot!
      expect(snap.incidents[0]?.phase).toBe('diagnosing')
      await supervisor.handle({ protocol: DOCTOR_PROTOCOL_VERSION, type: 'action', action: 'pause' })
      snap = (await supervisor.handle({ protocol: DOCTOR_PROTOCOL_VERSION, type: 'status' })).snapshot!
      expect(snap.phase).toBe('disabled')
      await supervisor.handle({ protocol: DOCTOR_PROTOCOL_VERSION, type: 'action', action: 'resume' })
      snap = (await supervisor.handle({ protocol: DOCTOR_PROTOCOL_VERSION, type: 'status' })).snapshot!
      expect(snap.phase).toBe('armed')
    } finally {
      await supervisor.stop()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
