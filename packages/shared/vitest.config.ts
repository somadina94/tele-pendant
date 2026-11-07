import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/alarm-severity.ts',
        'src/matrix-cell-state.ts',
        'src/operator-ready.ts',
        'src/roles.ts',
        'src/tags.ts',
      ],
      exclude: ['src/**/*.spec.ts', 'src/index.ts'],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
      },
    },
  },
});
