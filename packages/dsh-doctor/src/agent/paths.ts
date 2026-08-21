import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export interface DoctorPaths {
  root: string
  state: string
  registry: string
  incidents: string
  snapshots: string
  candidates: string
  quarantine: string
  capsule: string
  logs: string
  socket: string
  token: string
}

export function doctorPaths(env: NodeJS.ProcessEnv = process.env, home = homedir()): DoctorPaths {
  const raw = env.DSH_DOCTOR_HOME?.trim()
  const root = resolve(raw && raw !== '' ? raw : join(home, '.dsh-doctor'))
  return {
    root,
    state: join(root, 'state'),
    registry: join(root, 'registry'),
    incidents: join(root, 'incidents'),
    snapshots: join(root, 'snapshots'),
    candidates: join(root, 'candidates'),
    quarantine: join(root, 'quarantine'),
    capsule: join(root, 'capsule'),
    logs: join(root, 'logs'),
    socket: process.platform === 'win32' ? '\\.\pipe\dsh-doctor' : join(root, 'state', 'supervisor.sock'),
    token: join(root, 'state', 'supervisor.token'),
  }
}
