/**
 * gallery/_headers 缓存规则回归：皮肤画廊试穿模拟器相关的 JS 产物
 * （styles.js / manifest.js / official-facade.js）必须带 no-cache 头，
 * 且不再引用历史产物 bundles.js。deploy-gallery 已于 2026-08 退役
 * （站点整合进 dsh-market.com），组装类断言一并移除。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

test('gallery/_headers 的缓存规则覆盖 styles.js 且不再引用 bundles.js', () => {
  const headers = fs.readFileSync(ROOT + '/gallery/_headers', 'utf8')
  assert.ok(headers.includes('/styles.js'), '_headers 缺少 /styles.js 缓存规则')
  assert.ok(!headers.includes('bundles.js'), '_headers 仍引用已移除的 bundles.js')
})
