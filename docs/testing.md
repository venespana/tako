# Estrategia de tests

## Convención

| Tipo | Naming | Dónde | Cuándo corre |
|---|---|---|---|
| **Unitario** | `*.test.ts` / `*.test.tsx` | Junto al código | Siempre (`vitest run unit`) |
| **Integración** | `*.integ.test.ts` | `tests/integration/` | Solo con flag / en CI |
| **E2E** | `*.e2e.ts` | `tests/e2e/` | Release pipeline |

## Co-localización de unitarios

Los tests unitarios viven junto al código que prueban:

```
src/
├── shared/lib/logger.ts
├── shared/lib/logger.test.ts          ← al lado
├── domains/docker/domain/Stack.ts
├── domains/docker/domain/Stack.test.ts ← al lado
└── ...
```

## Velocidades esperadas

| Tipo | Velocidad |
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

## Scripts en package.json

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

- **PR**: solo unitarios.
- **Main merge**: unitarios + integración.
- **Release pipeline**: e2e.

## Qué testea cada nivel

| Nivel | Qué cubre | Setup |
|---|---|---|
| **Unit (domain/)** | Lógica pura, reglas, validaciones | Ninguno |
| **Unit (application/)** | Use cases con mocks | `vi.mock()` |
| **Unit (infrastructure/)** | Wrappers con librerías externas mockeadas | `vi.mock('dockerode')` |
| **Unit (cli/)** | Parser args + output format | Mock use cases |
| **Unit (tui/)** | Render componentes Ink | ink-testing-library |
| **Integration** | DockerClient real contra contenedor efímero | Testcontainers |
| **E2E** | Binario compilado ejecutando `tako` contra host real | Host docker disponible |
