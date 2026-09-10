import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: ['**/*.integ.*', '**/*.e2e.*', '**/*.generated.*'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.integ.test.ts'],
          testTimeout: 60_000,
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['tests/e2e/**/*.e2e.ts'],
          testTimeout: 120_000,
        },
      },
    ],
  },
  coverage: {
    exclude: ['**/*.generated.*', '**/*.test.*', '**/*.integ.*', '**/*.e2e.*'],
  },
});
