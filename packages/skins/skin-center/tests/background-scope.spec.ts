import { describe, expect, it } from 'vitest'

import {
  extractSkinBackgroundUserLayer,
  reconcileSkinBackgroundScope,
  skinBackgroundUserPatch,
} from '../src/core/background-scope.ts'

const current = {
  enabled: true,
  backgroundOpacity: 100,
  backgroundBlurEmpty: 0,
  backgroundBlurContent: 0,
  inputCardBlur: 10,
  bubbleOpacity: 50,
}

describe('skin-background scope reconciliation', () => {
  it('ignores a repeated namespace revision', () => {
    expect(reconcileSkinBackgroundScope(current, { revision: 7, user: undefined }, 7)).toEqual({
      accepted: false,
      revision: 7,
      patch: null,
    })
  })

  it('does not turn resolved defaults into a v2 patch', () => {
    expect(skinBackgroundUserPatch(current, { backgroundBlurEmpty: 4 })).toEqual({
      backgroundBlurEmpty: 4,
    })
    expect(skinBackgroundUserPatch(current, undefined)).toBeNull()
  })

  it('preserves an authoritative opacity when another legacy field is customized', () => {
    const result = reconcileSkinBackgroundScope(
      current,
      { revision: 8, user: { backgroundBlurEmpty: 4 } },
      7,
    )
    expect(result).toEqual({
      accepted: true,
      revision: 8,
      patch: { backgroundBlurEmpty: 4 },
    })
    expect({ ...current, ...result.patch }).toMatchObject({
      backgroundOpacity: 100,
      backgroundBlurEmpty: 4,
    })
  })

  it('accepts an explicitly stored default as an intentional user choice', () => {
    expect(skinBackgroundUserPatch(current, { backgroundOpacity: 0 })).toEqual({
      backgroundOpacity: 0,
    })
  })

  it('drops unknown and malformed user fields', () => {
    expect(extractSkinBackgroundUserLayer({ backgroundOpacity: '0', unknown: 1 })).toBeNull()
    expect(extractSkinBackgroundUserLayer({ backgroundOpacity: 0, unknown: 1 })).toEqual({ backgroundOpacity: 0 })
  })
})
