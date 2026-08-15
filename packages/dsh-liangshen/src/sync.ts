/**
 * Sync every preset directory under `sourceRoot` into `targetRoot` — the
 * dsh agent-presets discovery root (harness-home `.agent-presets`).
 *
 * A preset is a directory holding `agent.cordis.yml`; the directory name is
 * the preset id. Copy is per-directory and idempotent: a preset whose target
 * tree is byte-identical to the source tree is skipped, otherwise the source
 * tree is copied and any target files the source does not contain are removed.
 * Directories the plugin does not own (other presets the user authored) are
 * never touched.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'

/** One sync run's outcome, grouped for diagnostics. */
export interface SyncResult {
  /** Preset ids whose tree was (re)written this run. */
  synced: string[]
  /** Preset ids already current — nothing copied. */
  current: string[]
  /** Preset ids that failed, with the underlying error message. */
  failed: { id: string; error: string }[]
  /** Previously bundled preset ids removed from the target root this run. */
  retired: string[]
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

/** Preset files are small; identity means identical bytes, not just size/mtime. */
function sameFile(a: string, b: string): boolean {
  return readFileSync(a).equals(readFileSync(b))
}

/**
 * Remove files not in `keep` (relative paths), then remove only the
 * directories those removals left empty — still strictly inside `root`, so
 * sibling presets are never touched.
 */
function pruneExtras(root: string, keep: ReadonlySet<string>): void {
  const parents = new Set<string>()
  for (const file of filesUnder(root)) {
    if (!keep.has(relative(root, file))) {
      parents.add(dirname(file))
      rmSync(file, { force: true })
    }
  }
  for (const start of parents) {
    let dir: string | undefined = start
    while (dir !== undefined && relative(root, dir) !== '') {
      if (existsSync(dir) && readdirSync(dir).length === 0) {
        rmSync(dir, { recursive: true, force: true })
        dir = dirname(dir)
      } else {
        dir = undefined
      }
    }
  }
}

/** Copy `sourceRoot/<id>` into `targetRoot/<id>`, idempotently. */
export function syncOnePreset(sourceDir: string, targetDir: string): 'synced' | 'current' {
  const sourceFiles = filesUnder(sourceDir)
  const sourceSet = new Set(sourceFiles.map(file => relative(sourceDir, file)))

  if (existsSync(targetDir) && !statSync(targetDir).isDirectory()) {
    rmSync(targetDir, { recursive: true, force: true })
  }
  if (!existsSync(targetDir)) {
    cpSync(sourceDir, targetDir, { recursive: true, preserveTimestamps: true })
    pruneExtras(targetDir, sourceSet)
    return 'synced'
  }

  let dirty = false
  for (const file of sourceFiles) {
    const dest = join(targetDir, relative(sourceDir, file))
    if (!existsSync(dest) || !sameFile(file, dest)) {
      dirty = true
      break
    }
  }
  if (!dirty) {
    for (const file of filesUnder(targetDir)) {
      if (!sourceSet.has(relative(targetDir, file))) {
        dirty = true
        break
      }
    }
  }
  if (!dirty) return 'current'

  // Drop target-only entries first so file/dir type clashes never reach cpSync,
  // then copy and prune again per the post-copy contract.
  pruneExtras(targetDir, sourceSet)
  cpSync(sourceDir, targetDir, { recursive: true, preserveTimestamps: true })
  pruneExtras(targetDir, sourceSet)
  return 'synced'
}

/**
 * Sync every preset under `sourceRoot` into `targetRoot`, then remove
 * target directories named in `retire` that the bundle no longer ships —
 * preset ids the plugin once owned and later dropped. Only those exact ids
 * are removed; every other target directory is left untouched.
 * @param sourceRoot - plugin-owned preset tree (bundled in the package).
 * @param targetRoot - dsh agent-presets discovery root (e.g. <home>/.dsh/.agent-presets).
 * @param retire - previously bundled preset ids to remove when absent from the source.
 */
export function syncPresetTrees(sourceRoot: string, targetRoot: string, retire: string[] = []): SyncResult {
  const result: SyncResult = { synced: [], current: [], failed: [], retired: [] }
  mkdirSync(targetRoot, { recursive: true })
  if (existsSync(sourceRoot)) {
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
  }
  for (const id of retire) {
    if (existsSync(join(sourceRoot, id))) continue
    const stale = join(targetRoot, id)
    if (existsSync(stale) && statSync(stale).isDirectory()) {
      rmSync(stale, { recursive: true, force: true })
      result.retired.push(id)
    }
  }
  return result
}
