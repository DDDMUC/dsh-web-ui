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
  | 'active'
  | 'tryingOn'
  | 'tryOn'
  | 'exitTryOn'
  | 'apply'
  | 'applyCommand'
  | 'applyHint'
  | 'copied'
  | 'copyFailed'
  | 'theme'
  | 'themeLight'
  | 'themeDark'
  | 'tryOnError'

export const en: Record<SkinCenterKey, string> = {
  title: 'Skin Center',
  cardDescription: 'Try on any installed skin live in the GUI — exit restores instantly, applying persists via one terminal command.',
  expand: 'Expand',
  collapse: 'Collapse',
  intro: 'Try on any skin live — it takes effect instantly, exit restores the current look. Applying persists it across restarts.',
  active: 'Active',
  tryingOn: 'Trying on',
  tryOn: 'Try on',
  exitTryOn: 'Exit try-on',
  apply: 'Apply',
  applyCommand: 'Apply command',
  applyHint: 'The GUI cannot write your dsh config — apply by running:',
  copied: 'Copied',
  copyFailed: 'Copy failed',
  theme: 'Theme preview',
  themeLight: 'Light',
  themeDark: 'Dark',
  tryOnError: 'Try-on failed — see console',
}

export const zh: Record<SkinCenterKey, string> = {
  title: '皮肤中心',
  cardDescription: '在 GUI 内即时试穿任意皮肤，退出即完全还原；应用需在终端执行一条命令。',
  expand: '展开',
  collapse: '收起',
  intro: '任意皮肤可即时试穿，退出即完全还原；「应用」需在终端执行一条命令完成持久化。',
  active: '当前激活',
  tryingOn: '试穿中',
  tryOn: '试穿',
  exitTryOn: '退出试穿',
  apply: '应用',
  applyCommand: '应用命令',
  applyHint: '浏览器无法直接写 dsh 配置，请在终端执行：',
  copied: '已复制',
  copyFailed: '复制失败',
  theme: '主题预览',
  themeLight: '亮色',
  themeDark: '暗色',
  tryOnError: '试穿失败，详见控制台',
}
