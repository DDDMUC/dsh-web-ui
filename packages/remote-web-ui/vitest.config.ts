import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [tsconfigPaths({
    projects: [
      './tsconfig.vitest.json',
      '../test-zhu1090093659/tsconfig.base.json',
    ],
  })],
  test: {
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    pool: 'forks',
  },
})
