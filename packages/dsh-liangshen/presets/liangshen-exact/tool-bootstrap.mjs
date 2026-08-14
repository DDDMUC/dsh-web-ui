/**
 * `liangshen-exact` shares its bootstrap implementation with the main
 * `liangshen` preset (与主 preset 共用实现，仅 `tool-bootstrap` config 不同):
 * the only difference between the two presets is this row's configuration in
 * `agent.cordis.yml` (`shellTools`/`commonTools`), so the plugin logic below
 * is re-exported rather than copied. Keep it that way to prevent the two
 * copies from drifting.
 */

export { name, apply, classifyReasoning, hasAnchoredReasoning } from '../liangshen/tool-bootstrap.mjs'
