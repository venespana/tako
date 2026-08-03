# Testing strategy

## Convention

| Type | Naming | Where | When it runs |
|---|---|---|---|
| **Unit** | `*.test.ts` / `*.test.tsx` | Next to code | Always (`vitest run unit`) |
| **Integration** | `*.integ.test.ts` | `tests/integration/` | Only with flag / in CI |
| **E2E** | `*.e2e.ts` | `tests/e2e/` | Release pipeline |

## Co-location of unit tests

Unit tests live next to the code they test:

```
src/
├── shared/lib/logger.ts
├── shared/lib/logger.test.ts          ← next to it
├── domains/docker/domain/Stack.ts
├── domains/docker/domain/Stack.test.ts ← next to it
└── ...
```

## Expected speeds

| Type | Speed |
|---|---|
| Unit (domain/) | <50ms |
| Unit (application/infrastructure/cli/tui) | <100ms |
| Integration | 5-30s |
| E2E | 10-60s |

## Vitest config (projects)

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: ['**/*.integ.*', '**/*.e2e.*'],
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
});
```

## Scripts in package.json

```json
{
  "scripts": {
    "test": "vitest run unit",
    "test:watch": "vitest unit",
    "test:integration": "vitest run integration",
    "test:e2e": "vitest run e2e",
    "test:all": "vitest run",
    "test:coverage": "vitest run unit --coverage"
  }
}
```

## CI

- **PR**: unit only.
- **Main merge**: unit + integration.
- **Release pipeline**: e2e.

## What each level tests

| Level | What it covers | Setup |
|---|---|---|
| **Unit (domain/)** | Pure logic, rules, validations | None |
| **Unit (application/)** | Use cases with mocks | `vi.mock()` |
| **Unit (infrastructure/)** | Wrappers with mocked external libraries | `vi.mock('dockerode')` |
| **Unit (cli/)** | Args parser + output format | Mock use cases |
| **Unit (tui/)** | Ink component rendering | ink-testing-library |
| **Integration** | Real DockerClient against ephemeral container | Testcontainers |
| **E2E** | Compiled binary running `tako` against real host | Docker host available |
