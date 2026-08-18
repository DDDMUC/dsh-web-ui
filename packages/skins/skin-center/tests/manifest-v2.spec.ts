/**
 * Contract tests for the skin.json manifest v2 validator (issue #506, M1).
 *
 * Pins the fail-closed rules and — critically — the deprecated v1 allowlist:
 * the 11 legacy manifests must be rejected ONLY for missing v2 structure,
 * never for their v1-only fields (package / wiring / bodyAttr), which yield
 * migration warnings instead.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { validateSkinManifestV2 } from '../src/core/manifest-v2/validate.ts'

const here = dirname(fileURLToPath(import.meta.url))
const skinsRoot = resolve(here, '../..')

function legacyManifestIds(): string[] {
  return readdirSync(skinsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'skin-center')
    .map((d) => d.name)
    .sort()
}

function readLegacyManifest(id: string): unknown {
  return JSON.parse(readFileSync(resolve(skinsRoot, id, 'skin.json'), 'utf8'))
}

const validV2 = {
  $schema: 'https://schemas.linxin666.org/dsh-skin/v2.json',
  skinManifestVersion: 2,
  id: 'harbor',
  name: '夕港',
  nameEn: 'Harbor',
  version: '1.0.0',
  author: 'moeblack',
  tagline: '暮光蓝港',
  description: 'demo',
  tags: ['harbor', 'dusk'],
  accent: '#ff9d5c',
  order: 3,
  preview: { light: 'preview/light.png', dark: 'preview/dark.png' },
  requires: {
    contracts: [
      { apiVersion: 'x-org.linxin666.skin-center/v1alpha1', kind: 'SkinRuntime' },
      { apiVersion: 'x-org.linxin666.skin-center/v1alpha1', kind: 'SkinHooks', optional: true },
    ],
  },
  contributes: {
    stylesheet: 'skin.css',
    patches: 'patches.css',
    backgroundMedia: {
      light: { type: 'image', src: 'assets/bg-light.jpg' },
      dark: { type: 'video', src: 'assets/bg-dark.mp4', scrim: 'linear-gradient(#000, #111)' },
    },
  },
  facets: {
    client: { entry: 'hooks.mjs', apiVersion: 'x-org.linxin666.skin-center/v1alpha1' },
  },
}

describe('validateSkinManifestV2', () => {
  it('accepts a full valid v2 manifest', () => {
    const result = validateSkinManifestV2(validV2)
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.ok).toBe(true)
    expect(result.manifest?.id).toBe('harbor')
  })

  it('accepts a minimal v2 manifest', () => {
    const minimal = {
      skinManifestVersion: 2,
      id: 'plain',
      name: '朴素',
      nameEn: 'Plain',
      version: '0.1.0',
      author: 'tester',
      contributes: { stylesheet: 'skin.css' },
    }
    const result = validateSkinManifestV2(minimal)
    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('fails closed on unknown top-level fields', () => {
    const result = validateSkinManifestV2({ ...validV2, telemetry: true })
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('manifest: unknown field "telemetry"')
  })

  it('fails closed on unknown nested fields', () => {
    const result = validateSkinManifestV2({
      ...validV2,
      contributes: { ...validV2.contributes, scripts: ['x.js'] },
    })
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('manifest.contributes: unknown field "scripts"')
  })

  it('rejects non-object input without throwing', () => {
    expect(validateSkinManifestV2(null).ok).toBe(false)
    expect(validateSkinManifestV2([1, 2]).ok).toBe(false)
    expect(validateSkinManifestV2('skin').ok).toBe(false)
  })

  it('rejects v1 manifests with a codemod hint, not an unknown-field error', () => {
    const v1 = {
      id: 'harbor',
      name: '夕港',
      nameEn: 'Harbor',
      author: 'moeblack',
      package: '@linxin666/dsh-client-ui-skin-harbor',
      wiring: { id: 'ui-skin-harbor', bundleWired: false },
      bodyAttr: 'data-dsh-harbor',
    }
    const result = validateSkinManifestV2(v1)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toContain('skinManifestVersion')
    expect(result.errors.join('\n')).toContain('codemod')
    expect(result.errors.some((e) => e.includes('unknown field "package"'))).toBe(false)
    expect(result.errors.some((e) => e.includes('unknown field "wiring"'))).toBe(false)
    expect(result.errors.some((e) => e.includes('unknown field "bodyAttr"'))).toBe(false)
    expect(result.warnings).toHaveLength(3)
    expect(result.warnings.join('\n')).toContain('migration codemod')
  })

  it.each([
    ['../outside.js', 'parent escape'],
    ['/abs/hooks.mjs', 'absolute path'],
    ['https://evil.example/x.js', 'remote URL'],
    ['//evil.example/x.js', 'protocol-relative URL'],
  ])('rejects hooks entry %s (%s)', (entry) => {
    const result = validateSkinManifestV2({
      ...validV2,
      facets: { client: { entry, apiVersion: 'x-org.linxin666.skin-center/v1alpha1' } },
    })
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.startsWith('manifest.facets.client.entry'))).toBe(true)
  })

  it('rejects a bad facets.client.apiVersion', () => {
    const result = validateSkinManifestV2({
      ...validV2,
      facets: { client: { entry: 'hooks.mjs', apiVersion: 'skin-center/v2' } },
    })
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('facets.client.apiVersion'))).toBe(true)
  })

  it('rejects a bad backgroundMedia type', () => {
    const result = validateSkinManifestV2({
      ...validV2,
      contributes: {
        stylesheet: 'skin.css',
        backgroundMedia: { dark: { type: 'iframe', src: 'assets/x.html' } },
      },
    })
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('backgroundMedia.dark.type'))).toBe(true)
  })

  it('rejects unknown contract kinds', () => {
    const result = validateSkinManifestV2({
      ...validV2,
      requires: { contracts: [{ apiVersion: 'x-org.linxin666.skin-center/v1alpha1', kind: 'Admin' }] },
    })
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('kind'))).toBe(true)
  })

  it('rejects a malformed skin id', () => {
    for (const id of ['Harbor', '-x', 'a b', 'a/b']) {
      const result = validateSkinManifestV2({ ...validV2, id })
      expect(result.ok).toBe(false)
    }
  })

  it('keeps every legacy v1 skin on the deprecated allowlist (never unknown-field)', () => {
    const ids = legacyManifestIds()
    expect(ids.length).toBe(11)
    for (const id of ids) {
      const result = validateSkinManifestV2(readLegacyManifest(id))
      expect(result.ok).toBe(false)
      const unknowns = result.errors.filter((e) => e.includes('unknown field'))
      expect(unknowns, `${id}: ${unknowns.join('; ')}`).toEqual([])
      expect(result.warnings.length).toBeGreaterThan(0)
    }
  })
})
