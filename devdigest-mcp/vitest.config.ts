import { defineConfig } from 'vitest/config';

// No `resolve.alias` here, and none in tsconfig.json either. This package is
// standalone on purpose: it holds zod@4 while reviewer-core holds zod@3, and the
// two only stay apart as long as nothing aliases one package's source into the
// other. Do not add a `paths` entry or an alias.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
