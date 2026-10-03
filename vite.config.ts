/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';

// Basen settes via BASE_PATH ved bygging for GitHub Pages (f.eks. /borres_strom/).
export default defineConfig({
  base: import.meta.env?.BASE_PATH ?? globalThis.process?.env?.BASE_PATH ?? '/',
  build: { target: 'es2022', sourcemap: false },
  test: { include: ['tests/**/*.test.ts'] },
});
