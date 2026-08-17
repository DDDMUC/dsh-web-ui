import test from 'node:test'
import assert from 'node:assert/strict'
import { checkRuntimeImports, groupByPackageDir } from './runtime-deps-check.mjs'

test('flags a runtime import of a devDependencies-only package (issue #70)', () => {
  const violations = checkRuntimeImports(
    { dependencies: {}, devDependencies: { schemastery: '^3.18.0' } },
    { 'packages/skins/skin-center/lib/index.js': "import z from 'schemastery'" },
  )
  assert.equal(violations.length, 1)
  assert.equal(violations[0].specifier, 'schemastery')
})

test('accepts specifiers declared in dependencies', () => {
  const violations = checkRuntimeImports(
    { dependencies: { schemastery: '^3.18.0' } },
    { 'lib/index.js': "import z from 'schemastery'" },
  )
  assert.equal(violations.length, 0)
})

test('accepts runtime-provided @deepseek-ai/* specifiers', () => {
  const violations = checkRuntimeImports(
    { dependencies: {} },
    { 'lib/index.js': "import { Context } from '@deepseek-ai/cordis'" },
  )
  assert.equal(violations.length, 0)
})

test('accepts node: builtins and relative imports', () => {
  const violations = checkRuntimeImports(
    { dependencies: {} },
    { 'lib/index.js': "import { join } from 'node:path'\nimport x from './local.js'" },
  )
  assert.equal(violations.length, 0)
})

test('accepts package subpath imports when the parent package is a dependency', () => {
  const violations = checkRuntimeImports(
    { dependencies: { ssh2: '^1.17.0' } },
    { 'lib/index.js': "import { Client } from 'ssh2/lib/client'" },
  )
  assert.equal(violations.length, 0)
})

test('flags dynamic import() of a devDependencies-only package', () => {
  const violations = checkRuntimeImports(
    { dependencies: {} },
    { 'lib/index.js': "await import('some-optional-runtime-dep')" },
  )
  assert.equal(violations.length, 1)
  assert.equal(violations[0].specifier, 'some-optional-runtime-dep')
})

test('groupByPackageDir keeps a package lib file together with its package.json', () => {
  const byDir = groupByPackageDir([
    'packages/dsh-ssh/lib/index.js',
    'packages/dsh-ssh/package.json',
    'packages/skins/skin-center/lib/client.js',
    'packages/skins/skin-center/package.json',
  ])
  assert.deepEqual(new Set(byDir.keys()), new Set([
    'packages/dsh-ssh',
    'packages/skins/skin-center',
  ]))
  assert.deepEqual(new Set(byDir.get('packages/dsh-ssh')), new Set([
    'packages/dsh-ssh/lib/index.js',
    'packages/dsh-ssh/package.json',
  ]))
  assert.deepEqual(new Set(byDir.get('packages/skins/skin-center')), new Set([
    'packages/skins/skin-center/lib/client.js',
    'packages/skins/skin-center/package.json',
  ]))
})

test('groupByPackageDir uses the longest prefix so a sibling package name is not misattributed', () => {
  const byDir = groupByPackageDir([
    'packages/dsh-ssh/package.json',
    'packages/dsh-ssh/lib/index.js',
    'packages/dsh-ssh2/package.json',
    'packages/dsh-ssh2/lib/index.js',
  ])
  assert.ok(byDir.get('packages/dsh-ssh').includes('packages/dsh-ssh/lib/index.js'))
  assert.ok(byDir.get('packages/dsh-ssh2').includes('packages/dsh-ssh2/lib/index.js'))
  assert.ok(!byDir.get('packages/dsh-ssh').includes('packages/dsh-ssh2/lib/index.js'))
})
