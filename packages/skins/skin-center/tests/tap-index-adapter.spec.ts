/**
 * tapIndex adapter tests: stamping, link injection, fail-closed paths.
 */

import { describe, expect, it } from 'vitest'

import { makeSkinIndexTap, skinLinkTags, stampSkinAttribute } from '../src/tap-index-adapter.ts'
import type { SkinCatalog } from '../src/skin-repo.ts'

const HTML = '<!doctype html><html lang="zh-CN"><head><title>dsh</title></head><body><div id="root"></div></body></html>'

function catalogWith(ids: string[], patches: string[] = []): SkinCatalog {
  return {
    capturedAt: 0,
    diagnostics: [],
    skins: ids.map((id) => ({
      origin: 'builtin',
      dir: `/nonexistent/${id}`,
      warnings: [],
      manifest: {
        skinManifestVersion: 2,
        id,
        name: id,
        nameEn: id,
        version: '1.0.0',
        author: 'tester',
        contributes: {
          stylesheet: 'skin.css',
          ...(patches.includes(id) ? { patches: 'patches.css' } : {}),
        },
      },
    })),
  }
}

describe('stampSkinAttribute', () => {
  it('adds the attribute to a bare html tag', () => {
    expect(stampSkinAttribute('<html><head></head></html>', 'harbor'))
      .toBe('<html data-dsh-skin="harbor"><head></head></html>')
  })

  it('appends after existing attributes', () => {
    expect(stampSkinAttribute(HTML, 'harbor')).toContain('<html lang="zh-CN" data-dsh-skin="harbor">')
  })

  it('replaces an existing stamp', () => {
    const once = stampSkinAttribute(HTML, 'harbor')
    const twice = stampSkinAttribute(once, 'matrix')
    expect(twice).toContain('data-dsh-skin="matrix"')
    expect(twice).not.toContain('harbor')
  })
})

describe('skinLinkTags', () => {
  it('emits stylesheet only without patches', () => {
    expect(skinLinkTags('harbor', false)).toBe(
      '<link rel="stylesheet" href="/api/skin-center/v2/skins/harbor/stylesheet" data-dsh-skin-link="stylesheet">')
  })

  it('emits both links with patches', () => {
    const tags = skinLinkTags('harbor', true)
    expect(tags).toContain('/stylesheet')
    expect(tags).toContain('/patches')
  })
})

describe('makeSkinIndexTap', () => {
  it('returns the document unchanged with no active skin', () => {
    const tap = makeSkinIndexTap({ readActiveId: () => null, loadCatalog: () => catalogWith(['harbor']) })
    expect(tap(HTML)).toBe(HTML)
  })

  it('stamps and injects links for the active skin', () => {
    const tap = makeSkinIndexTap({ readActiveId: () => 'harbor', loadCatalog: () => catalogWith(['harbor'], ['harbor']) })
    const out = tap(HTML)
    expect(out).toContain('data-dsh-skin="harbor"')
    expect(out).toContain('/api/skin-center/v2/skins/harbor/stylesheet')
    expect(out).toContain('/api/skin-center/v2/skins/harbor/patches')
    expect(out.indexOf('data-dsh-skin-link')).toBeLessThan(out.indexOf('</head>'))
  })

  it('fails closed (stock look) for an unknown active id, warning once', () => {
    const warnings: string[] = []
    const tap = makeSkinIndexTap({
      readActiveId: () => 'ghost',
      loadCatalog: () => catalogWith(['harbor']),
      warn: (m) => warnings.push(m),
    })
    expect(tap(HTML)).toBe(HTML)
    expect(tap(HTML)).toBe(HTML)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('ghost')
  })

  it('fails closed on malformed html', () => {
    const warnings: string[] = []
    const tap = makeSkinIndexTap({
      readActiveId: () => 'harbor',
      loadCatalog: () => catalogWith(['harbor']),
      warn: (m) => warnings.push(m),
    })
    expect(tap('<div>no anchors</div>')).toBe('<div>no anchors</div>')
    expect(warnings).toHaveLength(1)
  })

  it('fails closed when the catalog loader throws', () => {
    const warnings: string[] = []
    const tap = makeSkinIndexTap({
      readActiveId: () => 'harbor',
      loadCatalog: () => { throw new Error('disk exploded') },
      warn: (m) => warnings.push(m),
    })
    expect(tap(HTML)).toBe(HTML)
    expect(warnings[0]).toContain('disk exploded')
  })
})
