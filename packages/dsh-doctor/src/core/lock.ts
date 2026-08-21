/**
 * Advisory lock manager for repair operations.
 *
 * Locks are directories under the capsule locks root with a token.json
 * inside; directory creation is atomic, so concurrent acquirers cannot both
 * win. Stale detection uses the token's heartbeat plus a pid-alive probe;
 * stealing renames the whole lock dir aside and retries once.
 */
import { join } from 'node:path'
import type { FsLike } from './fs.ts'
import { locksDir } from './paths.ts'
import type { LockScope, LockState, LockToken } from './types.ts'

export class LockError extends Error {
  readonly code: 'LOCK_HELD' | 'LOCK_STALE' | 'LOCK_ERROR'
  readonly scope: LockScope
  readonly key: string
  constructor(code: 'LOCK_HELD' | 'LOCK_STALE' | 'LOCK_ERROR', scope: LockScope, key: string, detail: string) {
    super('lock ' + scope + ':' + key + ': ' + detail)
    this.name = 'LockError'
    this.code = code
    this.scope = scope
    this.key = key
  }
}

export interface LockManagerDeps {
  fs: FsLike
  home: string
  /** Process id recorded in the token; defaults to 0 (tests). */
  pid?: number
  /** Host name recorded in the token; defaults to 'local'. */
  host?: string
  /** Milliseconds clock for heartbeat and staleness checks. */
  clock(): number
  /** ISO timestamp for token.startedAt. */
  iso(): string
  /** Alive probe for stale detection; defaults to 'always dead'. */
  pidAlive?(pid: number): boolean
  /** Sleep injection for polling loops; defaults to immediate. */
  sleep?(ms: number): Promise<void>
}

export interface AcquireOptions {
  intent: string
  timeoutMs?: number
  staleMs?: number
  heartbeatMs?: number
}

export interface LockHandle {
  readonly scope: LockScope
  readonly key: string
  readonly path: string
  release(): Promise<void>
  touch(now: number): Promise<void>
}

export interface LockManager {
  acquire(scope: LockScope, profile: string | undefined, options: AcquireOptions): Promise<LockHandle>
  status(scope: LockScope, profile: string | undefined): Promise<LockState>
  release(handle: LockHandle): Promise<void>
}

const DEFAULT_STALE_MS = 15000
const DEFAULT_TIMEOUT_MS = 30000
const lockKey = (scope: LockScope, profile: string | undefined): string => (scope === 'global' ? 'global' : 'profile/' + profile)

/** Create a lock manager rooted under the capsule locks dir. */
export function createLockManager(deps: LockManagerDeps): LockManager {
  const fs = deps.fs
  const root = locksDir(deps.home)
  const pid = deps.pid ?? 0
  const host = deps.host ?? 'local'
  const now = deps.clock
  const iso = deps.iso
  const pidAlive = deps.pidAlive ?? (() => false)
  const sleep = deps.sleep ?? (async () => {})

  const acquire = async (scope: LockScope, profile: string | undefined, options: AcquireOptions): Promise<LockHandle> => {
    const key = lockKey(scope, profile)
    const path = join(root, key.replace(/\//g, '__'))
    const staleMs = options.staleMs ?? DEFAULT_STALE_MS
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const deadline = now() + timeoutMs
    for (;;) {
      const exists = await fs.exists(path)
      if (!exists) {
        try {
          await fs.mkdir(root, { recursive: true })
          await fs.mkdir(path)
          const token: LockToken = {
            pid,
            host,
            intent: options.intent,
            startedAt: iso(),
            heartbeatAt: now(),
            nonce: Math.random().toString(36).slice(2, 10),
          }
          await fs.writeText(join(path, 'token.json'), JSON.stringify(token, undefined, 2) + String.fromCharCode(10))
          return makeHandle(scope, key, path)
        } catch (error) {
          if (isExistsError(error)) {
            // Lost the race; treat as held and continue polling.
          } else {
            throw new LockError('LOCK_ERROR', scope, key, String(error))
          }
        }
      } else {
        const stale = await isStale(path, staleMs)
        if (stale) {
          const stealTo = path + '.stale-' + String(now())
          try {
            await fs.rename(path, stealTo)
            await fs.mkdir(path)
            await fs.writeText(join(path, 'token.json'), JSON.stringify(buildToken(), undefined, 2) + String.fromCharCode(10))
            return makeHandle(scope, key, path, true)
          } catch (error) {
            if (isExistsError(error)) {
              // Another acquirer stole or created; continue polling.
            } else {
              throw new LockError('LOCK_STALE', scope, key, 'stale lock could not be displaced: ' + String(error))
            }
          }
        }
      }
      if (now() >= deadline) {
        const state = await readTokenOrNull(path)
        if (state !== undefined) throw new LockError('LOCK_HELD', scope, key, 'held by pid ' + state.pid + ' (intent ' + state.intent + ')')
        throw new LockError('LOCK_STALE', scope, key, 'lock present without a readable token')
      }
      await sleep(100)
    }
  }

  const buildToken = (): LockToken => ({
    pid,
    host,
    intent: 'unknown',
    startedAt: iso(),
    heartbeatAt: now(),
    nonce: Math.random().toString(36).slice(2, 10),
  })

  const isStale = async (path: string, staleMs: number): Promise<boolean> => {
    const token = await readTokenOrNull(path)
    if (token === undefined) return true
    if (!pidAlive(token.pid)) return true
    return now() - token.heartbeatAt > staleMs
  }

  const makeHandle = (scope: LockScope, key: string, path: string, stolen = false): LockHandle => {
    return {
      scope,
      key,
      path,
      async touch(at: number) {
        const token = await readTokenOrNull(path)
        if (token === undefined) throw new LockError('LOCK_ERROR', scope, key, 'lock dir vanished')
        await fs.writeText(join(path, 'token.json'), JSON.stringify({ ...token, heartbeatAt: at }, undefined, 2) + String.fromCharCode(10))
      },
      async release() {
        try {
          await fs.remove(path, { recursive: true })
        } catch (error) {
          if (!isMissingError(error)) throw error
        }
      },
    }
  }

  const status = async (scope: LockScope, profile: string | undefined): Promise<LockState> => {
    const key = lockKey(scope, profile)
    const path = join(root, key.replace(/\//g, '__'))
    const token = await readTokenOrNull(path)
    if (token === undefined) return { scope, key, path, held: false }
    return { scope, key, path, held: true, token }
  }

  const release = async (handle: LockHandle): Promise<void> => {
    await handle.release()
  }

  async function readTokenOrNull(path: string): Promise<LockToken | undefined> {
    try {
      const text = await fs.readText(join(path, 'token.json'))
      return JSON.parse(text) as LockToken
    } catch (error) {
      if (isMissingError(error)) return undefined
      return undefined
    }
  }

  return { acquire, status, release }
}

function isExistsError(error: unknown): boolean {
  const code = (error as { code?: string }).code
  return code === 'EEXIST' || (error instanceof Error && /exists/i.test(error.message))
}

function isMissingError(error: unknown): boolean {
  const code = (error as { code?: string }).code
  return code === 'ENOENT'
}
