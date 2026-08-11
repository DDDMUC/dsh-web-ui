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
 * new packages are added, unrelated entries are left untouched.
 *
 * Usage:
 *   node scripts/link-profile.mjs            # link/refresh the family
 *   node scripts/link-profile.mjs --dry-run  # report without changing
 */
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, symlinkSync, unlinkSync } from 'node:fs'
import { dirname, join, relative, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolvePath(SCRIPT_DIR, '..')
const DRY = process.argv.includes('--dry-run')

const PROFILES_NM = join(process.env.HOME, '.dsh', 'profiles', 'node_modules')
const LINK_DIR = join(PROFILES_NM, '@deepseek-ai')

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

function report(msg) {
  console.log(`[link-profile] ${msg}`)
}

const packages = familyPackages()
report(`found ${packages.length} family package(s) under packages/`)
if (DRY) report('--dry-run: no changes will be made')

if (!existsSync(LINK_DIR)) {
  report(`link dir missing: ${LINK_DIR} (run inside a DSH host machine)`)
  process.exit(1)
}

let changed = 0
for (const { name, dir } of packages) {
  const linkPath = join(LINK_DIR, name)
  const target = relative(LINK_DIR, dir) // keep links relative, like the official ones
  let exists = false
  try { lstatSync(linkPath); exists = true } catch {}
  if (exists) {
    let current = null
    try { current = readlinkSync(linkPath) } catch {}
    if (current === target) continue // already correct
    if (DRY) { report(`would replace ${name} -> ${current ?? '(broken)'}`); changed++; continue }
    unlinkSync(linkPath)
    symlinkSync(target, linkPath)
    report(`replaced ${name} -> ${target} (was ${current ?? '(broken)'})`)
  } else {
    if (DRY) { report(`would link ${name} -> ${target}`); changed++; continue }
    symlinkSync(target, linkPath)
    report(`linked ${name} -> ${target}`)
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
