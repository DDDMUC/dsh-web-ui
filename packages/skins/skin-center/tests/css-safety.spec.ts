/**
 * Tests for the skin CSS safety pipeline (issue #506).
 * Scoping is skin-center owned; violations fail closed.
 */

import { describe, expect, it } from 'vitest'

import { SkinCssSafetyError, transformSkinCss } from '../src/core/css-safety/transform.ts'

const ID = 'harbor'
const SCOPE = 'html[data-dsh-skin="harbor"]'

function scope(css: string, filename?: string) {
  return transformSkinCss(css, { skinId: ID, filename })
}

describe('transformSkinCss scoping', () => {
  it('scopes :root token remaps to the skin scope', () => {
    const { code } = scope(':root { --dsw-primary: #ff9d5c; }')
    expect(code).toContain(`${SCOPE} {`)
    expect(code).toContain('--dsw-primary: #ff9d5c')
    expect(code).not.toContain(':root')
  })

  it('scopes plain selectors as descendants', () => {
    const { code } = scope('.panel > .item:hover { color: red; }')
    expect(code).toContain(`${SCOPE} .panel > .item:hover`)
  })

  it('merges into html-typed heads instead of nesting them', () => {
    const { code } = scope('html body .app { margin: 0; }')
    expect(code).toContain(`${SCOPE} body .app`)
    expect(code).not.toContain('html html')
  })

  it('anchors dark-theme combos on body under the scope (official attr lives on body)', () => {
    const { code } = scope('html[data-ds-dark-theme] .panel { background: #000; }')
    expect(code).toContain('html[data-dsh-skin="harbor"] body[data-ds-dark-theme] .panel')
  })

  it('anchors bare [data-ds-*] heads on body too', () => {
    const { code } = scope('[data-ds-dark-theme] .panel { background: #000; }')
    expect(code).toContain('html[data-dsh-skin="harbor"] body[data-ds-dark-theme] .panel')
  })

  it('handles var() declarations (upstream visitor crash regression)', () => {
    const { code } = scope('body { color: var(--dsw-alias-label-primary); }')
    expect(code).toContain('var(--dsw-alias-label-primary)')
    expect(code).toContain('html[data-dsh-skin="harbor"] body')
  })

  it('keeps author formatting and values byte-for-byte outside selector heads', () => {
    const { code } = scope('.a { background: #112233; }')
    expect(code).toContain('#112233')
  })

  it('scopes selectors inside @media', () => {
    const { code } = scope('@media (max-width: 600px) { .sidebar { display: none; } }')
    expect(code).toContain('@media')
    expect(code).toContain(`${SCOPE} .sidebar`)
  })

  it('keeps @keyframes unscoped', () => {
    const { code } = scope('@keyframes harbor-drift { from { opacity: 0; } to { opacity: 1; } }')
    expect(code).toContain('@keyframes harbor-drift')
    expect(code).not.toContain(SCOPE)
  })

  it('scopes every selector in a list', () => {
    const { code } = scope('.a, .b { color: red; }')
    expect(code).toContain(`${SCOPE} .a`)
    expect(code).toContain(`${SCOPE} .b`)
  })

  it('scopes two skins independently (no cross-contamination)', () => {
    const a = scope('.x { color: red; }')
    const b = transformSkinCss('.x { color: blue; }', { skinId: 'matrix' })
    expect(a.code).toContain('data-dsh-skin="harbor"')
    expect(b.code).toContain('data-dsh-skin="matrix"')
    expect(a.code).not.toContain('matrix')
  })
})

describe('transformSkinCss whitelist (fail-closed)', () => {
  it('rejects @import', () => {
    expect(() => scope('@import "https://evil.example/x.css"; .a { color: red; }'))
      .toThrow(SkinCssSafetyError)
  })

  it('rejects remote URLs', () => {
    expect(() => scope('.a { background: url("https://evil.example/bg.png"); }'))
      .toThrow(/remote URL/)
    expect(() => scope('.a { background: url(http://evil.example/bg.png); }'))
      .toThrow(SkinCssSafetyError)
  })

  it('rejects protocol-relative URLs', () => {
    expect(() => scope('.a { background: url(//evil.example/bg.png); }'))
      .toThrow(/protocol-relative/)
  })

  it('rejects absolute and parent-escaping paths', () => {
    expect(() => scope('.a { background: url(/etc/passwd); }')).toThrow(/escapes/)
    expect(() => scope('.a { background: url(../secret.png); }')).toThrow(/escapes/)
  })

  it('accepts relative in-directory assets', () => {
    const { code } = scope('.a { background: url(assets/bg-dark.jpg); }')
    expect(code).toContain('assets/bg-dark.jpg')
  })

  it('collects every violation in one error', () => {
    try {
      scope('.a { background: url(https://a.example/x.png); } .b { background: url(/abs.png); }')
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(SkinCssSafetyError)
      expect((error as SkinCssSafetyError).violations).toHaveLength(2)
    }
  })
})

describe('transformSkinCss warnings', () => {
  it('warns on data: URLs but allows them', () => {
    const { warnings } = scope('.a { background: url(data:image/png;base64,AAAA); }')
    expect(warnings.some((w) => w.includes('data:'))).toBe(true)
  })

  it('warns on CSS-Modules hash-class reliance', () => {
    const { warnings } = scope('[class*="sidebar_item"] { color: red; }')
    expect(warnings.some((w) => w.includes('hash class'))).toBe(true)
  })

  it('warns on generic @keyframes names', () => {
    const { warnings } = scope('@keyframes spin { to { transform: rotate(360deg); } }')
    expect(warnings.some((w) => w.includes('spin'))).toBe(true)
  })
})
