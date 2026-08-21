import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import type { ProfileIdentity } from './protocol.ts'

const PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export function assertSafeProfileName(name: string): string {
  if (!PROFILE_NAME.test(name) || name === '.' || name === '..' || name === 'node_modules') {
    throw new Error(`doctor: unsafe profile name ${JSON.stringify(name)}`)
  }
  return name
}

export function resolveDshHome(env: NodeJS.ProcessEnv = process.env, home = homedir(), cwd = process.cwd()): string {
  const raw = env.DSH_HOME?.trim()
  if (!raw) return join(home, '.dsh')
  const expanded = raw === '~' ? home : raw.startsWith('~/') || raw.startsWith('~\\') ? join(home, raw.slice(2)) : raw
  return isAbsolute(expanded) ? resolve(expanded) : resolve(cwd, expanded)
}

export function profileIdentity(dshHome: string, name: string, dshExecutable: string, role: 'protected' | 'rescue' = 'protected'): ProfileIdentity {
  assertSafeProfileName(name)
  const canonicalHome = resolve(dshHome)
  const canonicalDsh = resolve(dshExecutable)
  const id = role === 'rescue'
    ? 'system-rescue'
    : createHash('sha256').update([canonicalHome, name, canonicalDsh].join('\0')).digest('hex')
  return { id, dshHome: canonicalHome, name, dshExecutable: canonicalDsh, role }
}

export function profileDir(identity: Pick<ProfileIdentity, 'dshHome' | 'name'>): string {
  return join(resolve(identity.dshHome), 'profiles', assertSafeProfileName(identity.name))
}
