/**
 * Automatic token fallbacks (issue #506 follow-up): for every official
 * --dsw-* token a skin does NOT remap, derive a translucent tint of the
 * skin's own palette — the skin's main color, "blurred" over whatever sits
 * behind the surface. The official shell keeps adding surfaces (e.g. the
 * composer's --dsw-specific-input-major); without this, an uncovered
 * surface snaps back to the official default gray-blue and breaks the
 * skin's palette. The fallback keeps skins future-proof across official
 * upgrades: any new token simply inherits the skin's tint instead of the
 * stock look.
 *
 * Rules (fail-closed, conservative):
 *  - never touch the static palette (not in the registry at all);
 *  - never override a token the skin defines;
 *  - never derive when the skin defines no anchor for the group;
 *  - semantic / structural groups (buttons, states, masks, shadows,
 *    inverted/foreground labels, fonts, easing) are skipped: a tint there
 *    would break contrast or layout instead of filling a gap.
 *
 * The derivation is textual (color-mix with a var() reference), so it
 * resolves against the skin's own remap — including the dark-theme block —
 * and stays theme-aware with zero runtime logic.
 */

import { OFFICIAL_TOKENS } from './official-tokens.generated.ts'

interface FallbackGroup {
  /** Skip list wins over every group. */
  skip: RegExp
  /** Anchor preference: the first anchor the skin defines wins. */
  anchors: string[]
  /** Tint strength of the anchor color (100 = opaque anchor). */
  alpha: number
}

/** Matched in order; the first group whose pattern hits wins. */
const GROUPS: FallbackGroup[] = [
  {
    skip: /(^|-)(mask|shadow|button|state|brand|scrollbar|foreground|inverted|dimmed)(-|$)|-font-|linear-|ease|duration|transition/,
    anchors: [],
    alpha: 0,
  },
  { skip: /-bg-/, anchors: ['--dsw-alias-bg-layer-1', '--dsw-alias-bg-base'], alpha: 65 },
  { skip: /-label-/, anchors: ['--dsw-alias-label-primary'], alpha: 70 },
  { skip: /-border-/, anchors: ['--dsw-alias-border-l2', '--dsw-alias-border-l1'], alpha: 55 },
  { skip: /-interactive-/, anchors: ['--dsw-alias-bg-layer-1'], alpha: 50 },
  { skip: /-specific-/, anchors: ['--dsw-alias-bg-layer-1', '--dsw-alias-bg-base'], alpha: 60 },
]

const EXCLUDED = /(^|-)(mask|shadow|button|state|brand|scrollbar|foreground|inverted|dimmed)(-|$)|-font-|linear-|ease|duration|transition/

function groupFor(token: string): FallbackGroup | null {
  if (EXCLUDED.test(token)) return null
  for (const group of GROUPS) {
    if (group.skip.test(token)) return group
  }
  return null
}

/**
 * Build fallback declarations for the official tokens the skin does not
 * define. Returns declaration strings ("--x: color-mix(...);" per token).
 */
export function deriveFallbackTokens(defined: ReadonlySet<string>): string[] {
  const out: string[] = []
  for (const token of OFFICIAL_TOKENS) {
    if (defined.has(token)) continue
    const group = groupFor(token)
    if (group === null) continue
    const anchor = group.anchors.find((candidate) => defined.has(candidate))
    if (anchor === undefined) continue
    out.push(`${token}: color-mix(in srgb, var(${anchor}) ${group.alpha}%, transparent);`)
  }
  return out
}
