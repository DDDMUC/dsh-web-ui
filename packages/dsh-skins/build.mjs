#!/usr/bin/env node
/**
 * Bundle every skin's assets INTO the dsh-skins aggregate package so npm
 * installs need no per-skin packages (npm charges per new package name —
 * the family keeps future skins inside this one existing package).
 *
 * For each packages/skins/<id> with a skin.json, copies:
 *   - skin.json (registry metadata)
 *   - lib/client.js (try-on bundle, served by /api/skin-center/bundle/<id>)
 * into packages/dsh-skins/skins/<id>/. Directories without a skin.json
 * (skin-center itself, workspace scaffolding) are skipped.
 *
 * Re-run whenever a skin is added/changed, then rebuild:
 *   pnpm --filter @linxin666/dsh-skins build
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const SOURCE_DIR = path.join(ROOT, 'packages', 'skins')
const OUT_DIR = path.join(__dirname, 'skins')

function syncDir(src, dst) {
  fs.rmSync(dst, { recursive: true, force: true })
  fs.mkdirSync(dst, { recursive: true })
  for (const dir of fs.readdirSync(src)) {
    const skinJson = path.join(src, dir, 'skin.json')
    if (!fs.statSync(skinJson, { throwIfNoEntry: false })) continue
    const bundle = path.join(src, dir, 'lib', 'client.js')
    if (!fs.statSync(bundle, { throwIfNoEntry: false })) {
      throw new Error(`packages/skins/${dir}: missing lib/client.js (build the skin bundle first)`)
    }
    const target = path.join(dst, dir)
    fs.mkdirSync(path.join(target, 'lib'), { recursive: true })
    fs.copyFileSync(skinJson, path.join(target, 'skin.json'))
    fs.copyFileSync(bundle, path.join(target, 'lib', 'client.js'))
    console.log('bundled skin:', dir)
  }
}

syncDir(SOURCE_DIR, OUT_DIR)
console.log('dsh-skins bundled skins ->', OUT_DIR)
