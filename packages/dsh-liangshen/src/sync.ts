/**
 * Sync every preset directory under `sourceRoot` into `targetRoot` — the
 * dsh agent-presets discovery root (harness-home `.agent-presets`).
 *
 * A preset is a directory holding `agent.cordis.yml`; the directory name is
 * the preset id. Copy is per-directory and idempotent: an existing file whose
 * size and mtime match is skipped, anything else is overwritten by a fresh
 * copy. Directories the plugin does not own (other presets the user authored)
 * are never touched.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

/** One sync run's outcome, grouped for diagnostics. */
export interface SyncResult {
  /** Preset ids whose tree was (re)written this run. */
  synced: string[]
  /** Preset ids already current — nothing copied. */
  current: string[]
  /** Preset ids that failed, with the underlying error message. */
  failed: { id: string; error: string }[]
}

function filesUnder(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) walk(path)
      else out.push(path)
    }
  }
  walk(root)
  return out
}

function sameFile(a: string, b: string): boolean {
  const sa = statSync(a)
  const sb = statSync(b)
  // Copy backends are not guaranteed to preserve sub-millisecond mtime
  // precision (macOS cpSync loses ~0.1ms), so tolerate a 1ms window.
  return sa.size === sb.size && Math.abs(sa.mtimeMs - sb.mtimeMs) < 1
}

/** Copy `sourceRoot/<id>` into `targetRoot/<id>`, idempotently. */
export function syncOnePreset(sourceDir: string, targetDir: string): 'synced' | 'current' {
  if (!existsSync(targetDir)) {
    cpSync(sourceDir, targetDir, { recursive: true, preserveTimestamps: true })
    return 'synced'
  }
  let dirty = false
  for (const file of filesUnder(sourceDir)) {
    const relative = file.slice(sourceDir.length + 1)
    const dest = join(targetDir, relative)
    if (!existsSync(dest) || !sameFile(file, dest)) dirty = true
  }
  if (!dirty) return 'current'
  cpSync(sourceDir, targetDir, { recursive: true, preserveTimestamps: true })
  return 'synced'
}

/**
 * Sync every preset under `sourceRoot` into `targetRoot`.
 * @param sourceRoot - plugin-owned preset tree (bundled in the package).
 * @param targetRoot - dsh agent-presets discovery root (e.g. <home>/.dsh/.agent-presets).
 */
export function syncPresetTrees(sourceRoot: string, targetRoot: string): SyncResult {
  const result: SyncResult = { synced: [], current: [], failed: [] }
  if (!existsSync(sourceRoot)) return result
  mkdirSync(targetRoot, { recursive: true })
  for (const entry of readdirSync(sourceRoot)) {
    const source = join(sourceRoot, entry)
    if (!statSync(source).isDirectory()) continue
    const id = basename(source)
    try {
      const outcome = syncOnePreset(source, join(targetRoot, id))
      ;(outcome === 'synced' ? result.synced : result.current).push(id)
    } catch (error) {
      result.failed.push({ id, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return result
}
