import { defineConfig } from 'tsdown'

/**
 * Host-half build: transpile src straight to lib/*.js (ESM). Types come from
 * `tsc -b` (lib/types) — tsdown only produces the runtime entry the
 * package.json exports point at. External modules (cordis, schemastery,
 * @deepseek-ai/*) resolve at runtime from the dsh profile tree, never from
 * this repo's own install.
 */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    invariant: 'src/invariant.ts',
  },
  format: ['esm'],
  outDir: 'lib',
  // Declarations come from `tsc -b` (lib/types); tsdown only emits runtime js.
  dts: false,
  external: [/^@deepseek-ai\//, 'cordis', 'cosmokit', 'schemastery'],
})
