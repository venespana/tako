# Technical Stack

## Core

- **Runtime**: Bun (with `bun build --compile` for binary distribution).
- **Compatibility**: Node 20+ also supported (needed for npm distribution).
- **Language**: strict TypeScript.
- **TUI**: Ink 5+ (React for the terminal).
- **React**: 18+.

## Libraries

| Purpose | Lib | Notes |
|---|---|---|
| Docker API | `dockerode` | Node standard, supports SSH via docker-modem |
| SSH client | `ssh2` | Mature (mscdex), base of almost all SSH libs |
| CLI args | `citty` or `commander` | To decide when starting implementation |
| UI components | `ink-table`, `ink-spinner`, `ink-text-input`, `ink-select-input`, `ink-tab` | Standard Ink set |
| Config storage | `conf` or `configstore` | Handles `~/.config/tako/` |
| Secrets | `crypto` (native Node) + master passphrase | For SSH passwords |
| Colors | `picocolors` | Non-Ink output |

## Dev tooling

| Purpose | Tool |
|---|---|
| Lint + format | ESLint + Prettier |
| Tests | Vitest + ink-testing-library + Testcontainers |
| Build | Bun compile (cross-platform) |

## Critical restriction: Node 20+ compat

Since Tako distributes via npm in addition to the compiled binary, the code **MUST work on Node 20+ in addition to Bun**.

- **Forbidden**: Bun-only APIs (`Bun.serve`, `Bun.password`, `Bun.file`, etc.).
- **Allowed**: standard Node APIs (`fs/promises`, `crypto`, `child_process`, etc.).
- Bun is used only for development (speed) and to generate the compiled binary.
