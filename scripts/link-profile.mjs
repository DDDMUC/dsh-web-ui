#!/usr/bin/env node
/**
 * Link every dsh-web-ui family plugin into the dsh profile's global
 * @deepseek-ai namespace (~/.dsh/profiles/node_modules/@deepseek-ai).
 *
 * The dsh loader resolves plugin rows (cordis.patch.yml `name:` entries) by
 * Node package resolution from the profile directory, which walks up through
 * ~/.dsh/profiles/node_modules — the layer where the official dsh packages
 * live. Plugins installed through `dsh plugin add` land in the profile's own
 * node_modules and resolve fine; the family links here make the same
 * resolution work for the aggregate bundles (web-ui-all / dsh-skins) whose
 * children are transitively resolved, and repair links left over from older
 * manual setups.
 *
 * Idempotent and safe to rerun: stale links pointing elsewhere are replaced,
 * new packages are added, unrelated entries are left untouched. Real files or
 * directories at a link path are never removed — they are reported and
 * skipped.
 *
 * Usage:
 *   node scripts/link-profile.mjs            # link/refresh the family
 *   node scripts/link-profile.mjs --dry-run  # report without changing
 */
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, symlinkSync, unlinkSync } from 'node:fs'
import { dirname, join, relative, resolve as resolvePath } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolvePath(SCRIPT_DIR, '..')

/**
 * Pure decision logic for one link path: what should the caller do with the
 * entry currently sitting at the link path? No filesystem access, so it can
 * be unit-tested directly (see scripts/link-profile.test.mjs).
 *
 * @param {'missing'|'symlink'|'file'|'dir'} existing kind of entry at the link path
 * @param {string} target desired relative symlink target
 * @param {string|null} currentTarget current readlink() value, or null when
 *   the entry is not a symlink (or its link target could not be read)
 * @returns {'create'|'keep'|'replace'|'skip-report'}
 */
export function decideLinkAction(existing, target, currentTarget) {
  if (existing === 'missing') return 'create'
  if (existing === 'symlink') {
    return currentTarget === target ? 'keep' : 'replace'
  }
  // Real file or directory: never unlink it, just report and leave it alone.
  return 'skip-report'
}

function report(msg) {
  console.log(`[link-profile] ${msg}`)
}

/** Every family package: packages/* and packages/skins/* that has a package.json with a name. */
function familyPackages() {
  const found = []
  const roots = [
    join(REPO_ROOT, 'packages'),
    join(REPO_ROOT, 'packages', 'skins'),
  ]
  for (const root of roots) {
    if (!existsSync(root)) continue
    for (const entry of readdirSync(root).sort()) {
      const pkgJson = join(root, entry, 'package.json')
      if (!existsSync(pkgJson)) continue
      let name
      try { name = JSON.parse(readFileSync(pkgJson, 'utf8')).name } catch { continue }
      if (name && name.startsWith('@deepseek-ai/')) {
        found.push({ name: name.slice('@deepseek-ai/'.length), dir: join(root, entry) })
      }
    }
  }
  return found
}

/**
 * Packages owned by the official dsh bundle layer (the dsh base/web-app
 * bundles ship them and the loader link-layer sync pins them back to the
 * source checkout on every boot). Linking them here would fight the sync;
 * leave them to the official layer. dsh-client-ui-skin-xp is the default
 * skin bundled with @deepseek-ai/dsh-web-app.
 */
const OFFICIAL_BUNDLE_PACKAGES = new Set(['dsh-client-ui-skin-xp'])

function main() {
  const DRY = process.argv.includes('--dry-run')

  const HOME = process.env.HOME || homedir()
  if (!HOME) {
    report('cannot determine home directory (HOME is unset and os.homedir() is empty)')
    process.exit(1)
  }
  const PROFILES_NM = join(HOME, '.dsh', 'profiles', 'node_modules')
  const LINK_DIR = join(PROFILES_NM, '@deepseek-ai')

  const packages = familyPackages().filter((p) => !OFFICIAL_BUNDLE_PACKAGES.has(p.name))
  report(`found ${familyPackages().length} family package(s) under packages/ (${packages.length} managed, ${familyPackages().length - packages.length} owned by official bundles)`)
  if (DRY) report('--dry-run: no changes will be made')

  if (!existsSync(LINK_DIR)) {
    report(`link dir missing: ${LINK_DIR} (run inside a DSH host machine)`)
    process.exit(1)
  }

  let changed = 0
  for (const { name, dir } of packages) {
    const linkPath = join(LINK_DIR, name)
    const target = relative(LINK_DIR, dir) // keep links relative, like the official ones
    let existing = 'missing'
    try {
      const st = lstatSync(linkPath)
      existing = st.isSymbolicLink() ? 'symlink' : st.isDirectory() ? 'dir' : 'file'
    } catch {}
    let current = null
    if (existing === 'symlink') {
      try { current = readlinkSync(linkPath) } catch {}
    }
    const action = decideLinkAction(existing, target, current)
    if (action === 'keep') continue // already correct
    if (action === 'skip-report') {
      if (DRY) {
        report(`would skip ${name} (not a symlink)`)
      } else {
        report(`skipped (not a symlink, untouched): ${linkPath}`)
      }
      continue
    }
    if (action === 'create') {
      if (DRY) { report(`would link ${name} -> ${target}`); changed++; continue }
      symlinkSync(target, linkPath)
      report(`linked ${name} -> ${target}`)
    } else {
      if (DRY) { report(`would replace ${name} -> ${current ?? '(broken)'}`); changed++; continue }
      unlinkSync(linkPath)
      symlinkSync(target, linkPath)
      report(`replaced ${name} -> ${target} (was ${current ?? '(broken)'})`)
    }
    changed++
  }

  // Report stale family links (pointing outside this repo) so the user can
  // clean them by hand if needed.
  const stale = []
  for (const entry of readdirSync(LINK_DIR)) {
    const linkPath = join(LINK_DIR, entry)
    let target
    try { target = readlinkSync(linkPath) } catch { continue }
    const abs = resolvePath(LINK_DIR, target)
    const known = packages.some((p) => p.name === entry)
    if (known) continue
    if (abs.startsWith(REPO_ROOT)) continue
    stale.push({ entry, target })
  }
  if (stale.length) {
    for (const s of stale) report(`stale (untouched): ${s.entry} -> ${s.target}`)
  }

  report(changed === 0 ? 'nothing to do' : `${changed} link(s) ${DRY ? 'would be ' : ''}updated`)
}

// Run only when invoked as the entry script, so the module can be imported
// (e.g. by the unit tests) without touching the real profile.
if (resolvePath(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main()
}
