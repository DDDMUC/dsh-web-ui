import type { UserConfig } from 'tsdown'

/** Host-only build: this package has no browser half (ui-code-kline owns the client). */
export default {
  name: '@deepseek-ai/dsh-code-kline',
  entry: ['src/index.ts', 'src/invariant.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
} satisfies UserConfig
