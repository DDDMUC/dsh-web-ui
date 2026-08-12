/**
 * Skin-center locale dictionaries. The plugin-card name, its description,
 * and every control of the in-GUI skin center is localized through the
 * standard `t` seat.
 */

/** Copy keys owned by this plugin. */
export type SkinCenterKey =
  | 'title'
  | 'cardDescription'
  | 'expand'
  | 'collapse'
  | 'intro'
  | 'official'
  | 'officialTagline'
  | 'active'
  | 'tryingOn'
  | 'tryOn'
  | 'exitTryOn'
  | 'apply'
  | 'applying'
  | 'restore'
  | 'applyFailed'
  | 'appliedUnconfirmed'
  | 'theme'
  | 'themeLight'
  | 'themeDark'
  | 'tryOnError'

export const en: Record<SkinCenterKey, string> = {
  title: 'Skin Center',
  cardDescription: 'Try on any installed skin live in the GUI — exit restores instantly, applying persists in one click.',
  expand: 'Expand',
  collapse: 'Collapse',
  intro: 'Try on any skin live — it takes effect instantly, exit restores the current look. Apply persists it across restarts.',
  official: 'Official default',
  officialTagline: 'The stock DSH look with no skin applied.',
  active: 'Active',
  tryingOn: 'Trying on',
  tryOn: 'Try on',
  exitTryOn: 'Exit try-on',
  apply: 'Apply',
  applying: 'Applying…',
  restore: 'Restore',
  applyFailed: 'Apply failed',
  appliedUnconfirmed: 'Applied, but the change has not been confirmed — refresh the page if the skin did not switch',
  theme: 'Theme preview',
  themeLight: 'Light',
  themeDark: 'Dark',
  tryOnError: 'Try-on failed — see console',
}

export const zh: Record<SkinCenterKey, string> = {
  title: '皮肤中心',
  cardDescription: '在 GUI 内即时试穿任意皮肤，退出即完全还原；应用一键完成并自动刷新。',
  expand: '展开',
  collapse: '收起',
  intro: '任意皮肤可即时试穿，退出即完全还原；「应用」一键持久化，页面自动刷新生效。',
  official: '官方默认',
  officialTagline: '还原 DSH 官方默认外观，不应用任何皮肤。',
  active: '当前激活',
  tryingOn: '试穿中',
  tryOn: '试穿',
  exitTryOn: '退出试穿',
  apply: '应用',
  applying: '应用中…',
  restore: '恢复默认',
  applyFailed: '应用失败',
  appliedUnconfirmed: '已写入配置但尚未确认生效——若皮肤未切换请手动刷新页面',
  theme: '主题预览',
  themeLight: '亮色',
  themeDark: '暗色',
  tryOnError: '试穿失败，详见控制台',
}
