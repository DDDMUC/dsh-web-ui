/**
 * Skin CSS safety pipeline (issue #506, contract section "校验纪律").
 *
 * Every skin stylesheet passes through this transform before it is served or
 * injected — built-in or community, skin.css or patches.css. It is the
 * technical enforcement of the coupling boundary:
 *
 *  - SCOPING: every selector is force-scoped under
 *    `html[data-dsh-skin="<id>"]`. `:root` / `html` / dark-theme combos
 *    are merged INTO the scope compound; everything else becomes a
 *    descendant. Skins never declare bodyAttr; the skin-center owns scoping.
 *  - WHITELIST (fail-closed): no `@import`, no remote or protocol-relative
 *    URLs, no absolute paths escaping the skin directory; only relative
 *    in-directory assets (and `data:`, which warns — prefer assets/ files).
 *  - WARNINGS: reliance on CSS-Modules hash class names (`[class*=...]`)
 *    warns; generic @keyframes names warn (single-active-skin model makes
 *    collisions unlikely but cross-skin name reuse is still fragile).
 *
 * NOTE: this module runs host-side (node) in the M2 loader. lightningcss is
 * a native dependency and must stay OUT of the browser bundle; when the
 * loader is wired, move lightningcss to "dependencies" and mark it external
 * in tsdown.config.ts.
 */

import { transform } from 'lightningcss'

export interface SkinCssTransformOptions {
  /** Manifest id; becomes the html[data-dsh-skin="<id>"] scope value. */
  skinId: string
  /** Logical filename for error messages (e.g. "skin.css" / "patches.css"). */
  filename?: string
}

export interface SkinCssTransformResult {
  code: string
  warnings: string[]
}

/** Violation of the CSS whitelist. Always fatal (fail-closed). */
export class SkinCssSafetyError extends Error {
  override readonly name = 'SkinCssSafetyError'
  constructor(
    message: string,
    readonly violations: string[],
  ) {
    super(message)
  }
}

type SelectorComponent = Record<string, any>

function scopeCompound(skinId: string): SelectorComponent[] {
  return [
    { type: 'type', name: 'html' },
    {
      type: 'attribute',
      namespace: null,
      name: 'data-dsh-skin',
      operation: { operator: 'equal', value: skinId, caseSensitivity: 'case-sensitive' },
    },
  ]
}

function skinAttribute(skinId: string): SelectorComponent {
  return {
    type: 'attribute',
    namespace: null,
    name: 'data-dsh-skin',
    operation: { operator: 'equal', value: skinId, caseSensitivity: 'case-sensitive' },
  }
}

function hasSkinAttribute(compound: SelectorComponent[], skinId: string): boolean {
  return compound.some(
    (c) => c.type === 'attribute' && c.name === 'data-dsh-skin'
      && c.operation?.operator === 'equal' && c.operation?.value === skinId,
  )
}

/**
 * Rewrite one selector so it lives under html[data-dsh-skin="<id>"].
 * Returns warnings encountered (hash-class reliance).
 */
function scopeSelector(
  selector: SelectorComponent[],
  skinId: string,
  warnings: string[],
  context: string,
): SelectorComponent[] {
  for (const c of selector) {
    if (
      c.type === 'attribute' && c.name === 'class'
      && ['substring', 'prefix', 'suffix'].includes(c.operation?.operator)
    ) {
      warnings.push(`${context}: [class${c.operation.operator === 'substring' ? '*' : c.operation.operator === 'prefix' ? '^' : '$'}=...] relies on CSS-Modules hash class names and may break on any official rebuild`)
    }
  }

  const firstCombinator = selector.findIndex((c) => c.type === 'combinator')
  const headEnd = firstCombinator === -1 ? selector.length : firstCombinator
  const head = selector.slice(0, headEnd)
  const tail = selector.slice(headEnd)

  // :root → the scope itself.
  if (head.length === 1 && head[0].type === 'pseudo-class' && head[0].kind === 'root') {
    return [...scopeCompound(skinId), ...tail]
  }

  const hasHtmlType = head.some((c) => c.type === 'type' && c.name === 'html')
  // html[...] (incl. dark-theme combos) → merge the skin attribute in.
  if (hasHtmlType) {
    const merged = hasSkinAttribute(head, skinId) ? head : [...head, skinAttribute(skinId)]
    return [...merged, ...tail]
  }

  // [data-ds-...] head without an html type → anchor it on html + skin scope.
  const hasOfficialAttr = head.some((c) => c.type === 'attribute' && String(c.name).startsWith('data-ds-'))
  if (hasOfficialAttr && !head.some((c) => c.type === 'type')) {
    const merged = [
      { type: 'type', name: 'html' },
      ...head,
      ...(hasSkinAttribute(head, skinId) ? [] : [skinAttribute(skinId)]),
    ]
    return [...merged, ...tail]
  }

  // Everything else → descendant of the scope.
  return [...scopeCompound(skinId), { type: 'combinator', value: 'descendant' }, ...selector]
}

/** Check one url() target against the whitelist. */
function checkUrl(raw: string, context: string, violations: string[], warnings: string[]): void {
  const url = raw.trim().replace(/^["']|["']$/g, '')
  if (/^https?:\/\//i.test(url)) {
    violations.push(`${context}: remote URL "${url}" is not allowed; ship the asset in the skin directory`)
  } else if (url.startsWith('//')) {
    violations.push(`${context}: protocol-relative URL "${url}" is not allowed`)
  } else if (url.startsWith('/')) {
    violations.push(`${context}: absolute path "${url}" escapes the skin directory`)
  } else if (/^(?:\.\.\/)/.test(url)) {
    violations.push(`${context}: path "${url}" escapes the skin directory`)
  } else if (/^data:/i.test(url)) {
    warnings.push(`${context}: inline data: URL — prefer a file under assets/`)
  }
}

const GENERIC_KEYFRAMES = new Set([
  'spin', 'pulse', 'fade', 'fadein', 'fade-in', 'fadeout', 'fade-out',
  'slide', 'slidein', 'slide-in', 'bounce', 'glow', 'blink', 'shake', 'float',
])

/**
 * Transform a skin stylesheet: force-scope every selector under
 * html[data-dsh-skin="<id>"] and enforce the whitelist. Throws
 * SkinCssSafetyError on any violation (fail-closed).
 */
export function transformSkinCss(css: string, options: SkinCssTransformOptions): SkinCssTransformResult {
  const { skinId } = options
  const filename = options.filename ?? 'skin.css'
  const violations: string[] = []
  const warnings: string[] = []

  const result = transform({
    filename,
    code: Buffer.from(css),
    // Pure AST visit + print; no minify, no targets — the browser is modern.
    visitor: {
      Rule: {
        import(rule) {
          violations.push(`${filename}: @import "${rule.value.url}" is not allowed; skins are single-file stylesheets`)
          // Returning nothing keeps the parsed rule untouched; the throw
          // below discards the output anyway.
        },
        keyframes(rule) {
          const name = rule.value.name
          const value = typeof name === 'string' ? name : name?.value
          if (typeof value === 'string' && GENERIC_KEYFRAMES.has(value.toLowerCase())) {
            warnings.push(`${filename}: generic @keyframes name "${value}" may collide across skins; prefix it (e.g. ${skinId}-${value})`)
          }
        },
        style(rule) {
          // The lightningcss selector union is huge; we only read/emit the
          // handful of component shapes we construct, so cast at the seam.
          rule.value.selectors = rule.value.selectors.map((sel) =>
            scopeSelector(sel as SelectorComponent[], skinId, warnings, filename)) as typeof rule.value.selectors
          return rule
        },
      },
      Url(url) {
        checkUrl(url.url, filename, violations, warnings)
        return url
      },
    },
  })

  if (violations.length > 0) {
    throw new SkinCssSafetyError(
      `skin CSS violates the whitelist:\n - ${violations.join('\n - ')}`,
      violations,
    )
  }
  return { code: result.code.toString(), warnings }
}
