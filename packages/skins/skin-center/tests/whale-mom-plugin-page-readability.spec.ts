import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// whale-mom leaves the app root transparent and paints nothing on the plugin
// manager page (dsh-client-ui-plugin-manager): with the skin-center background
// scrim at its default 0 the plugin rows sat straight on the full-bleed
// artwork and the descriptions were unreadable in both themes (#1683). The fix
// must give that page a surface in each theme and stay scoped to the page's
// stable data-plugin-* hooks so no other surface inherits it. The checks are
// mechanical so the guard cannot be dropped silently again.

const PAGE_HOOK = '[data-plugin-panel]'
const DARK_PAGE_HOOK = `body[data-ds-dark-theme] ${PAGE_HOOK}`
const PLUGIN_HOOKS = [
  'data-plugin-panel',
  'data-plugin-detail',
  'data-plugin-group',
  'data-plugin-item',
  'data-plugin-package',
]
const LIGHT_SURFACE = 'rgba(240, 247, 253, 0.55)'
const DARK_SURFACE = 'rgba(30, 44, 86, 0.6)'

const parseRules = (css: string): Array<{ selectors: string[]; body: string }> => {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return (stripped.match(/[^{}]+\{[^{}]*\}/g) ?? []).map((rule) => {
    const brace = rule.indexOf('{')
    return {
      selectors: rule
        .slice(0, brace)
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean),
      body: rule.slice(brace),
    }
  })
}

describe('whale-mom plugin manager page readability', () => {
  const rules = parseRules(
    readFileSync(resolve(__dirname, '../skins/whale-mom/patches.css'), 'utf-8'),
  )

  const surfaceRules = rules.filter(
    (rule) => rule.body.includes(LIGHT_SURFACE) || rule.body.includes(DARK_SURFACE),
  )
  const lightPanel = rules.find((rule) => rule.selectors.includes(PAGE_HOOK))
  const darkPanel = rules.find((rule) => rule.selectors.includes(DARK_PAGE_HOOK))

  it('user gets a surface behind the plugin page in the light theme', () => {
    // Given the whale-mom patches with the plugin-page fix
    // When the light-theme page rule is inspected
    // Then the page container paints the light surface
    expect(lightPanel?.body ?? '', 'light-theme plugin-page surface missing').toContain(LIGHT_SURFACE)
  })

  it('user gets a surface behind the plugin page in the dark theme', () => {
    // Given the whale-mom patches with the plugin-page fix
    // When the dark-theme page rule is inspected
    // Then the page container paints the lifted dark surface
    expect(darkPanel?.body ?? '', 'dark-theme plugin-page surface missing').toContain(DARK_SURFACE)
  })

  it('user keeps every other surface untouched', () => {
    // Given every rule that paints one of the plugin-page surfaces
    // When each rule's selector list is inspected
    // Then all of them are scoped to a data-plugin-* hook
    expect(surfaceRules.length).toBeGreaterThan(0)
    const unscoped = surfaceRules.flatMap((rule) =>
      rule.selectors.filter((selector) => !PLUGIN_HOOKS.some((hook) => selector.includes(hook))),
    )
    expect(unscoped, 'plugin-page surface leaked into an unscoped selector').toEqual([])
  })
})
