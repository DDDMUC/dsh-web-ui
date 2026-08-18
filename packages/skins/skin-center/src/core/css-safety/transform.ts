/**
 * Skin CSS safety pipeline (issue #506, contract section "校验纪律").
 *
 * Every skin stylesheet passes through this transform before it is served or
 * injected — built-in or community, skin.css or patches.css. It is the
 * technical enforcement of the coupling boundary:
 *
 *  - SCOPING: every selector is force-scoped under
 *    `html[data-dsh-skin="<id>"]`. Root-ish heads are rewritten, not nested:
 *    `:root` / `html` merge into the scope; `body` and bare official
 *    `[data-ds-*]` heads (the official dark-theme attribute lives on BODY)
 *    become descendants of the scope; everything else becomes a descendant.
 *  - WHITELIST (fail-closed): no `@import`, no remote or protocol-relative
 *    URLs, no absolute paths escaping the skin directory; only relative
 *    in-directory assets (and `data:`, which warns — prefer assets/ files).
 *  - WARNINGS: reliance on CSS-Modules hash class names (`[class*=...]`)
 *    warns; generic @keyframes names warn.
 *
 * Two-pass design (do NOT collapse): selector scoping is a text-level
 * surgery guided by lightningcss rule locations, and lightningcss itself is
 * only used to PARSE/validate (read-only visitors). Returning mutated rules
 * from a lightningcss 1.32/1.33 style visitor crashes declaration
 * deserialization on any var() declaration ("failed to deserialize; expected
 * an object-like struct named Specifier") — an upstream serialization defect
 * the text-level pass sidesteps entirely. A side benefit: the output keeps
 * the author's formatting and values byte-for-byte outside selector heads.
 *
 * NOTE: this module runs host-side (node) in the M2 loader. lightningcss is
 * a native dependency and must stay OUT of the browser bundle (external in
 * tsdown.config.ts).
 * @module @linxin666/dsh-client-ui-skin-center/css-safety
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
  readonly violations: string[]
  constructor(message: string, violations: string[]) {
    super(message)
    this.violations = violations
  }
}

interface RuleSpan {
  /** Byte/char offset of the selector start in the source. */
  start: number
  /** Char offset just past the opening '{'. */
  openBrace: number
}

/** Convert a lightningcss Location2 (0-based line, 1-based column) to a char offset. */
function locToOffset(source: string, line: number, column: number): number {
  let offset = 0
  let currentLine = 0
  while (currentLine < line) {
    const next = source.indexOf('\n', offset)
    if (next === -1) return source.length
    offset = next + 1
    currentLine += 1
  }
  return offset + column - 1
}

/**
 * Find the opening '{' of a rule whose selector starts at `start`,
 * tracking parens/brackets/strings so :is(...), [title="{"] etc. cannot
 * fake an early brace.
 */
function findOpenBrace(source: string, start: number): number {
  let parens = 0
  let brackets = 0
  let quote: string | null = null
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i]
    if (quote !== null) {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch === '(') parens += 1
    else if (ch === ')') parens -= 1
    else if (ch === '[') brackets += 1
    else if (ch === ']') brackets -= 1
    else if (ch === '{' && parens === 0 && brackets === 0) return i
    else if (ch === ';' && parens === 0 && brackets === 0) return -1 // at-rule, not a style rule
  }
  return -1
}

/** Split a selector list on top-level commas (paren/bracket/string aware). */
function splitSelectors(selectorText: string): string[] {
  const parts: string[] = []
  let parens = 0
  let brackets = 0
  let quote: string | null = null
  let current = ''
  for (let i = 0; i < selectorText.length; i += 1) {
    const ch = selectorText[i]
    if (quote !== null) {
      current += ch
      if (ch === '\\') { current += selectorText[i + 1] ?? ''; i += 1 }
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; current += ch; continue }
    if (ch === '(') parens += 1
    else if (ch === ')') parens -= 1
    else if (ch === '[') brackets += 1
    else if (ch === ']') brackets -= 1
    if (ch === ',' && parens === 0 && brackets === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  parts.push(current)
  return parts
}

const HEAD_DATA_DS = /^\[data-ds-[a-z0-9-]+/

/**
 * Scope one selector under html[data-dsh-skin="<id>"]. Text-level and
 * conservative: only the well-defined root-ish heads get rewritten; any
 * other selector simply becomes a descendant of the scope.
 */
export function scopeSelectorText(selector: string, skinId: string): string {
  const scope = `html[data-dsh-skin="${skinId}"]`
  const trimmed = selector.trim()
  const leading = selector.slice(0, selector.length - selector.trimStart().length)
  const trailing = selector.slice(leading.length + trimmed.length)

  // :root merges into the scope itself.
  if (trimmed === ':root' || trimmed.startsWith(':root ') || trimmed.startsWith(':root,')) {
    return leading + scope + trimmed.slice(':root'.length) + trailing
  }
  // html[data-ds-dark-theme] ... -> the official attribute lives on BODY.
  if (/^html\[data-ds-/.test(trimmed)) {
    const rest = trimmed.slice('html'.length)
    return `${leading}${scope} body${rest}${trailing}`
  }
  // bare html head merges into the scope.
  if (trimmed === 'html' || trimmed.startsWith('html ')) {
    return leading + scope + trimmed.slice('html'.length) + trailing
  }
  // body heads (incl. body[data-ds-dark-theme]) become scoped descendants.
  if (trimmed === 'body' || trimmed.startsWith('body ') || trimmed.startsWith('body[') || trimmed.startsWith('body:')) {
    return `${leading}${scope} ${trimmed}${trailing}`
  }
  // bare official [data-ds-*] heads anchor on body under the scope
  // (the official dark-theme attribute is set on document.body).
  if (HEAD_DATA_DS.test(trimmed)) {
    return `${leading}${scope} body${trimmed}${trailing}`
  }
  // Default: descendant of the scope.
  return `${leading}${scope} ${trimmed}${trailing}`
}

/** Scope every selector in one selector-list text, preserving separators. */
export function scopeSelectorList(selectorText: string, skinId: string): string {
  return splitSelectors(selectorText)
    .map((sel) => scopeSelectorText(sel, skinId))
    .join(',')
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
 * SkinCssSafetyError on any violation (fail-closed); lightningcss parse
 * errors propagate as-is (malformed CSS is also a hard failure).
 */
export function transformSkinCss(css: string, options: SkinCssTransformOptions): SkinCssTransformResult {
  const { skinId } = options
  const filename = options.filename ?? 'skin.css'
  const violations: string[] = []
  const warnings: string[] = []
  const spans: RuleSpan[] = []

  // Single lightningcss pass with READ-ONLY visitors: collect rule spans for
  // the text surgery, run the whitelist checks, warn on hash-class reliance
  // and generic keyframes. Nothing is returned to the serializer (see the
  // module header for the upstream crash this avoids).
  transform({
    filename,
    code: Buffer.from(css),
    visitor: {
      Rule: {
        import(rule) {
          violations.push(`${filename}: @import "${rule.value.url}" is not allowed; skins are single-file stylesheets`)
        },
        keyframes(rule) {
          const name = rule.value.name
          const value = typeof name === 'string' ? name : (name as { value?: unknown })?.value
          if (typeof value === 'string' && GENERIC_KEYFRAMES.has(value.toLowerCase())) {
            warnings.push(`${filename}: generic @keyframes name "${value}" may collide across skins; prefix it (e.g. ${skinId}-${value})`)
          }
        },
        style(rule) {
          const loc = rule.value.loc
          if (loc) {
            const start = locToOffset(css, loc.line, loc.column)
            const openBrace = findOpenBrace(css, start)
            if (openBrace !== -1) spans.push({ start, openBrace })
          }
          for (const sel of rule.value.selectors) {
            for (const c of sel as Array<Record<string, any>>) {
              if (
                c.type === 'attribute' && c.name === 'class'
                && ['substring', 'prefix', 'suffix'].includes(c.operation?.operator)
              ) {
                warnings.push(`${filename}: [class*=...]-style attribute matching relies on CSS-Modules hash class names and may break on any official rebuild`)
              }
            }
          }
        },
      },
      Url(url) {
        checkUrl(url.url, filename, violations, warnings)
      },
    },
  })

  if (violations.length > 0) {
    throw new SkinCssSafetyError(
      `skin CSS violates the whitelist:\n - ${violations.join('\n - ')}`,
      violations,
    )
  }

  // Text-level selector surgery, first span to last, building the output
  // incrementally so original offsets stay valid. Nested rules (inside
  // @media etc.) carry their own absolute locations and are rewritten
  // independently.
  const sorted = [...spans].sort((a, b) => a.start - b.start)
  const scope = `html[data-dsh-skin="${skinId}"]`
  let out = ''
  let cursor = 0
  for (const span of sorted) {
    const selectorText = css.slice(span.start, span.openBrace)
    const close = findCloseBrace(css, span.openBrace)
    out += css.slice(cursor, span.start)
    const scoped = scopeSelectorList(selectorText, skinId)
    const block = close === -1 ? css.slice(span.openBrace) : css.slice(span.openBrace, close + 1)
    out += scoped + block
    // The official light alias tokens live on plain body, and a body-level
    // definition beats anything a skin remaps on html for every descendant
    // (custom-property inheritance is tree-based, not specificity-based).
    // :root-derived custom properties therefore get a body-level clone so
    // the light remap actually reaches the shell surfaces. Dark remaps are
    // already body-scoped (body[data-ds-dark-theme]) and need no clone.
    if (/^:root\b/.test(selectorText.trim()) && close !== -1) {
      const body = css.slice(span.openBrace + 1, close)
      const props = body
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => /^--[\w-]+\s*:/.test(line))
      if (props.length > 0) {
        out += `\n${scope} body {\n  ${props.join('\n  ')}\n}\n`
      }
    }
    cursor = close === -1 ? span.openBrace : close + 1
  }
  out += css.slice(cursor)
  return { code: out, warnings }
}

/**
 * Find the matching closing brace for the block opening at openBrace.
 * Conservative: counts braces, skips strings and comments; returns -1 when
 * the block never closes (callers then keep the remainder as-is).
 */
function findCloseBrace(css: string, openBrace: number): number {
  let depth = 0
  let i = openBrace
  let inString: string | null = null
  let inComment = false
  for (; i < css.length; i++) {
    const ch = css[i]
    const next = css[i + 1]
    if (inComment) {
      if (ch === '*' && next === '/') {
        inComment = false
        i++
      }
      continue
    }
    if (inString !== null) {
      if (ch === '\\') {
        i++
      } else if (ch === inString) {
        inString = null
      }
      continue
    }
    if (ch === '/' && next === '*') {
      inComment = true
      i++
      continue
    }
    if (ch === '"' || ch === "'") {
      inString = ch
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}
