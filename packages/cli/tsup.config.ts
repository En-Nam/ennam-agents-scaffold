import { defineConfig } from 'tsup';
import { cp, rm } from 'node:fs/promises';
import path from 'node:path';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  shims: true,
  banner: { js: '#!/usr/bin/env node' },
  async onSuccess() {
    // Copy templates next to dist so the published package is self-contained.
    const src = path.resolve('..', '..', 'templates');
    const dst = path.resolve('dist', '..', 'templates');
    await rm(dst, { recursive: true, force: true });
    await cp(src, dst, { recursive: true });
  },
});
