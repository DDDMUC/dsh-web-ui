import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { REPO_ROOT, applySync, checkSync, copyEntries, headerFor, renderCopy, stripHeader } from './sync-shared.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))

test('header/strip round-trips every file kind', () => {
  for (const file of ['settings-form.ts', 'PluginSettingsCard.tsx', 'settings-card.module.css']) {
    const source = 'export const x = 1' + String.fromCharCode(10)
    const rendered = renderCopy(source, file)
    assert.ok(rendered.startsWith(headerFor(file)))
    assert.equal(stripHeader(rendered, file), source)
    assert.equal(stripHeader('mangled ' + rendered.slice(10), file), undefined)
  }
})

test('copies cover all five consumers with the trio at their original paths', () => {
  const entries = copyEntries()
  assert.equal(entries.length, 15)
  for (const { source, target } of entries) {
    assert.ok(source.startsWith(join(REPO_ROOT, 'shared', 'client', 'settings')))
    assert.match(target, /packages\/dsh-(pet|task-board|remote-web-ui|live-stats|tool-describe-image)\/src\/client\/(settings-form\.ts|PluginSettingsCard\.tsx|settings-card\.module\.css)$/)
  }
})

test('checkSync detects drift and applySync repairs it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sync-shared-test-'))
  try {
    // Fake tree: shared source + one consumer copy with wrong content.
    const sourceDir = join(root, 'shared', 'client', 'settings')
    await mkdir(sourceDir, { recursive: true })
    await writeFile(join(sourceDir, 'settings-form.ts'), 'export const good = 1' + String.fromCharCode(10))
    await writeFile(join(sourceDir, 'PluginSettingsCard.tsx'), 'export const card = 1' + String.fromCharCode(10))
    await writeFile(join(sourceDir, 'settings-card.module.css'), '.card { color: red }' + String.fromCharCode(10))
    const targetDir = join(root, 'packages', 'dsh-pet', 'src', 'client')
    await mkdir(targetDir, { recursive: true })
    await writeFile(join(targetDir, 'settings-form.ts'), renderCopy('export const bad = 2' + String.fromCharCode(10), 'settings-form.ts'))

    // checkSync compares all consumers; the missing files count as drift too.
    const before = await checkSync(root)
    assert.ok(before.some(entry => entry.reason === 'content drifted from shared source'))
    assert.ok(before.some(entry => entry.reason === 'missing'))

    await applySync(root)
    const after = await checkSync(root)
    assert.deepEqual(after, [])
    const fixed = await readFile(join(targetDir, 'settings-form.ts'), 'utf8')
    assert.equal(stripHeader(fixed, 'settings-form.ts'), 'export const good = 1' + String.fromCharCode(10))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('the live tree is in sync', async () => {
  const drift = await checkSync()
  assert.deepEqual(drift, [])
})