/**
 * Standalone tsdown config for the __NAME__ plugin skeleton.
 *
 * Emits the node half (src/index.ts -> lib/index.js) and the browser half
 * entry (src/client.ts -> lib/client.js) as plain ESM with declarations, so
 * the package is buildable and typecheckable before any real logic lands.
 *
 * NOTE: a production GUI plugin should adopt the repo's client-bundle preset
 * (closure-factory artifact for window.__ModuleLoader__, CSS Modules inlined,
 * externals resolved through the loader module table). Sibling plugins vendor
 * it: packages/skins/tsdown.client.ts (+ web/src/platform.ts) or a copy of
 * task-board's build/tsdown.client.ts (+ build/web/src/platform.ts). Once
 * vendored, switch this file to
 * `import { clientBundle } from './build/tsdown.client.ts'` and use
 * `export default clientBundle('@deepseek-ai/dsh-client-ui-__NAME__', ['src/index.ts'])`.
 */
export default [
  {
    entry: ['src/index.ts'],
    outDir: 'lib',
    format: ['esm'],
    dts: true,
    clean: true,
  },
  {
    entry: ['src/client.ts'],
    outDir: 'lib',
    format: ['esm'],
    dts: true,
    clean: false,
  },
]
