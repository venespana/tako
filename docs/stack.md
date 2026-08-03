# Stack técnico

## Core

- **Runtime**: Bun (con `bun build --compile` para distribución binaria).
- **Compatibilidad**: Node 20+ también soportado (necesario para distribución npm).
- **Lenguaje**: TypeScript estricto.
- **TUI**: Ink 5+ (React para terminal).
- **React**: 18+.

## Librerías

| Propósito | Lib | Notas |
|---|---|---|
| Docker API | `dockerode` | Estándar Node, soporta SSH via docker-modem |
| SSH client | `ssh2` | Madura (mscdex), base de casi todas las libs SSH |
| CLI args | `citty` o `commander` | A decidir al iniciar implementación |
| UI components | `ink-table`, `ink-spinner`, `ink-text-input`, `ink-select-input`, `ink-tab` | Set estándar Ink |
| Config storage | `conf` o `configstore` | Manejo `~/.config/tako/` |
| Secretos | `crypto` (Node nativo) + master passphrase | Para passwords SSH |
| Colores | `picocolors` | Output no-Ink |

## Dev tooling

| Propósito | Tool |
|---|---|
| Lint + format | ESLint + Prettier |
| Tests | Vitest + ink-testing-library + Testcontainers |
| Build | Bun compile (cross-platform) |

## Restricción crítica: Node 20+ compat

Como Tako distribuye via npm además de binario compilado, el código **DEBE funcionar en Node 20+ además de Bun**.

- **Prohibido**: APIs Bun-only (`Bun.serve`, `Bun.password`, `Bun.file`, etc.).
- **Permitido**: APIs estándar Node (`fs/promises`, `crypto`, `child_process`, etc.).
- Bun se usa solo para desarrollo (velocidad) y para generar el binario compilado.
