/**
 * Active-skin selection persistence (issue #506): a tiny JSON document under
 * $DSH_HOME written by POST /api/skin-center/v2/active and read on every
 * index.html response by the tapIndex adapter. Kept dependency-free and
 * synchronous: the tap runs per response and must never await.
 * @module @linxin666/dsh-client-ui-skin-center/active-state
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { userSkinsDir } from './skin-repo.ts'

/** Default location: $DSH_HOME/skin-center-active.json. */
export function defaultActiveStatePath(): string {
  return join(userSkinsDir(), '..', 'skin-center-active.json')
}

/** Read the persisted active skin id (null = stock look / unreadable). */
export function readActiveSelection(path: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { active?: unknown }
    return typeof parsed.active === 'string' ? parsed.active : null
  } catch {
    return null
  }
}

/** Persist the active skin id (creates the parent directory). */
export function writeActiveSelection(path: string, id: string | null): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify({ active: id }, null, 2) + '\n', 'utf8')
}
