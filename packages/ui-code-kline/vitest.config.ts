import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [tsconfigPaths({
    projects: [
      './tsconfig.vitest.json',
      '../../../test-zhu1090093659/tsconfig.base.json',
    ],
  })],
  resolve: {
    // Tests resolve sibling DSH sources, which can import their own React
    // copy; keep one instance shared with the renderer from this repo.
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  test: {
    include: ['tests/**/*.spec.{ts,tsx}'],
    pool: 'forks',
  },
})
