#!/usr/bin/env node
/**
 * dsh-skins build — retired no-op carrier (issue #506).
 *
 * Skins are pure asset directories built into the skin-center package
 * (packages/skins/skin-center/skins/<id>/); this aggregate no longer copies
 * skin assets. The package is kept for one release cycle as a dependency
 * carrier: users who upgrade @linxin666/dsh-skins automatically pull in
 * @linxin666/dsh-client-ui-skin-center, which ships every built-in skin.
 *
 * The script stays on the package's build/prepare hooks so existing
 * automation keeps working; it intentionally does nothing.
 */

console.log('dsh-skins build: no-op (skins are built into @linxin666/dsh-client-ui-skin-center; see issue #506)')
