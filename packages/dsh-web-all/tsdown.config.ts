/**
 * Build config for the dsh-web-all aggregate: node-half lib/ plus the
 * browser bundle lib/client.js (the compat shim), same client-bundle preset
 * the family packages keep (shared/tsdown.client.ts). The fault-isolation
 * shell (src/shell.ts + its degraded ledger) ships as additional node-half
 * entries beside lib/index.js — the generated patch rows' `name` mounts this
 * package directly and its main entry forwards to the shell, while the
 * standalone `@linxin666/dsh-web-all/shell` subpath stays importable for
 * tests and tooling.
 */
import { clientBundle } from '../../shared/tsdown.client.ts'

export default clientBundle('@linxin666/dsh-web-all', ['src/index.ts'], {
  companions: [
    {
      name: '@linxin666/dsh-web-all/shell',
      entry: ['src/shell.ts', 'src/degraded.ts'],
      outDir: 'lib',
      format: ['esm'],
      platform: 'node',
      target: 'es2024',
      fixedExtension: false,
      dts: false,
      clean: false,
      sourcemap: true,
      external: ['@deepseek-ai/cordis'],
    },
  ],
})