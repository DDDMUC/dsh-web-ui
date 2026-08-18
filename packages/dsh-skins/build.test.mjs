import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

test('retired carrier build is a no-op and copies no skin assets', () => {
  const out = execFileSync(process.execPath, [path.join(here, 'build.mjs')], { encoding: 'utf8' })
  assert.match(out, /no-op/)
  // The carrier ships no skins/ directory: assets live in the skin-center package.
  assert.equal(fs.existsSync(path.join(here, 'skins')), false)
})
