/**
 * deploy-gallery 组装门禁：gallery v2 产物集（manifest.js / styles.js /
 * official-facade.js + html）变化时，部署脚本的 ROOT_FILES 必须同步，
 * 否则 Deploy Gallery 工作流在 main 上硬失败而 gallery:check 不变红。
 * 本测试以 --dry-run 真实跑一遍组装（不触碰 wrangler / 网络），
 * 复现「产物集漂移 → 组装失败」的回归路径。
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-gallery-test-'))

after(() => { fs.rmSync(outDir, { recursive: true, force: true }) })

test('deploy-gallery --dry-run 能对已提交的 gallery 产物完成组装', () => {
  const res = spawnSync(process.execPath, ['scripts/deploy-gallery', '--dry-run', '--out', outDir], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  assert.equal(res.status, 0, 'dry-run 退出码非 0:\n' + res.stderr + '\n' + res.stdout)
  for (const f of ['index.html', 'preview.html', 'manifest.js', 'styles.js', 'official-facade.js', '_headers']) {
    assert.ok(fs.existsSync(path.join(outDir, f)), '组装产物缺少 ' + f)
  }
})

test('gallery/_headers 的缓存规则覆盖 styles.js 且不再引用 bundles.js', () => {
  const headers = fs.readFileSync(path.join(ROOT, 'gallery', '_headers'), 'utf8')
  assert.ok(headers.includes('/styles.js'), '_headers 缺少 /styles.js 规则')
  assert.ok(!headers.includes('bundles.js'), '_headers 仍引用已删除的 bundles.js')
})
