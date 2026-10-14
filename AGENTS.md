# AGENTS.md — Tako

Guide for AI agents working in this repository. Tako is a TypeScript terminal application that manages docker-compose-based homelabs over SSH: an interactive TUI (Ink + React) and a thin Commander CLI behind one binary. It runs on Bun and ships as a single compiled Linux binary. The project is in design/pre-release — no usable release yet.

## Quick path

1. Install dependencies: `bun install`
2. Run the TUI: `bun run start` — or the CLI with watch: `bun run dev`
3. Verify your work: `bun run test && bun run typecheck && bun run lint`

## Commands

Project convention: `bun run <script>` (engines: bun >= 1.1, node >= 20).

| Purpose             | Command                                             |
| ------------------- | --------------------------------------------------- |
| Dev (CLI, watch)    | `bun run dev`                                       |
| Run TUI             | `bun run start`                                     |
| Build binary        | `bun run build`                                     |
| Unit tests          | `bun run test` (watch: `bun run test:watch`)        |
| Integration tests   | `bun run test:integration`                          |
| E2E tests           | `bun run test:e2e`                                  |
| All test projects   | `bun run test:all`                                  |
| Coverage            | `bun run test:coverage`                             |
| Lint                | `bun run lint` (`lint:fix`, `lint:changed`)         |
| Format              | `bun run format` (`format:check`, `format:changed`) |
| Typecheck           | `bun run typecheck`                                 |
| Generate TUI routes | `bun run generate:routes`                           |

Notes:

- `start` runs a `prestart` hook that regenerates `src/tui/app/routes.generated.ts`; `build` runs a `prebuild` that generates the version file. If routes look stale, run `bun run generate:routes`.
- `build` targets `bun-linux-x64-modern` and outputs `dist/tako-linux-x64`.

## Architecture

Hybrid architecture: Feature-Sliced Design (FSD) for the TUI, Clean Architecture per domain for the backend, plus a shared kernel, with an in-process services API layer consumed by both presentations (ADR-0019; arrives in phase F3). `src/index.tsx` is the bootstrap only: no arguments → Ink TUI; any arguments → Commander CLI.

| Path                  | Role                                                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.tsx`       | Entry point bootstrap (TUI vs CLI). No business logic.                                                                                                                                                        |
| `src/cli/`            | Commander CLI (`doctor`, `remote add`, agent provisioning: `install`, `uninstall`, `status`, `run`). Commands are lazy-imported to keep Ink out of compiled CLI paths.                                        |
| `src/services/`       | In-process API layer (ADR-0019): complete domain functions consumed by cli and tui; all wiring private. Arrives in phase F3.                                                                                  |
| `src/domains/<name>/` | Backend domains (`docker`, `remotes`, `system`, `agent`), each split into `domain/` (types, pure logic), `application/` (use cases + ports), `infrastructure/` (adapters: ssh2, conf, dockerode, bun:sqlite). |
| `src/shared/`         | Shared kernel (`lib/` only, 2 files: session password + version helpers).                                                                                                                                     |
| `src/tui/`            | FSD layers: `app/` (providers, routes), `pages/`, `widgets/`, `features/`, `entities/`, `shared/`. Ink 7 + React 19 + react-router + zustand.                                                                 |

Dependency rules (documented in `docs/architecture.md`; target model in ADR-0019). Any rule without a mechanical check is explicitly marked `review-only` — mechanical enforcement lands in phase F4:

- `shared` imports from nothing (`review-only`); `domains` may import `shared` (`review-only`).
- `services` import `domains` + `shared`; all wiring is private inside services (`review-only`; the layer arrives in phase F3).
- `cli` may import `services` + `shared`; `tui` may import `services`, its own FSD layers, and `shared` (`review-only` until F4 zones).
- `cli`/`tui` must not import `domains` directly — contract types re-export through `services` (`review-only`; rule arrives with F3).
- `src/tui/` must not import from `src/cli/`; `src/cli/` must not import from `src/tui/` (enforced by ESLint zones, no exceptions — ADR-0020 supersedes ADR-0014; exceptions removed in E2).
- `services`/`domains` must not import presentation (`cli`/`tui`) (`review-only`).
- `application` must not import infrastructure (e.g. `dockerode`) directly — it declares ports; `infrastructure` implements adapters (`review-only`).

## Conventions

Verified from repo files (`openspec/config.yaml`, eslint/prettier/vitest configs, package.json):

- **Language**: English is the canonical language for code, docs, and specs.
- **Formatting**: Prettier — single quotes, 120 print width (100 for Markdown), 2-space indent, LF endings, `arrowParens: avoid`, JSX single quotes. ESLint (flat config) includes Prettier as its final config.
- **TypeScript**: strict mode plus `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`; ES2022 target, Bundler module resolution, `react-jsx`.
- **Prefer typed objects with functions over switch-case statements** — map variants through lookup objects of typed handlers; a switch is acceptable only for exhaustive narrowing over a closed union where the object shape cannot carry the behavior (user decision 2026-10-08).
- **Import order**: enforced by `import-x/order` — alphabetized, grouped, blank line between groups; `react`/`react-dom`/`ink` are pinned to the top like builtins.
- **Testing**: Vitest with 3 projects — unit tests co-located next to source as `*.test.ts(x)` in `src/`; integration tests as `*.integ.test.ts` in `tests/integration/` (testcontainers, 60s timeout); e2e as `*.e2e.ts` in `tests/e2e/` (120s timeout). Openspec enforces TDD (`tdd: true`).
- **Pre-commit**: `lint-staged` runs Prettier on all staged files, then `eslint --fix` + `tsc --noEmit` on staged TS/JSX.
- **Spec-driven development (openspec)**: `openspec/config.yaml` governs changes — each proposal is scoped to one command/feature; specs use Given/When/Then and RFC 2119 keywords; the command contract in `docs/commands.md` is closed (10 commands — never invent new commands without a decision record); changes touching host state, compose files, or embedded templates need a rollback plan; archived change folders under `openspec/` are an audit trail — never delete or modify them.
- **Docs**: `docs/` holds architecture, stack, CLI spec, testing strategy, distribution, and ADRs in `docs/decisions/`.
- **Repo-local agent skills**: `.agents/skills/` provides `feature-sliced-design`, `nodejs-best-practices`, and `reactjs-best-practices` guidance.

## Workflow Rules (MANDATORY)

These rules apply to every agent working in this repository and override default behavior.

1. **Human-in-the-loop commits.** Never run `git commit` or `git push` without explicit confirmation from the user. Propose the commit and its message, then wait for approval.
2. **Branching.** Never work directly on `main` or `develop`. Create a `feature/<name>` branch for feature or SDD work, and a `fix/<name>` branch for quick fixes and hotfixes. The user may explicitly authorize a per-change exception (e.g., trivial config/docs changes).
3. **Ask, don't assume.** Consult the user about every doubt, ambiguity, or missing piece of information found during any work, before acting on assumptions.
4. **Use native question tools.** When asking the user anything, use the harness's native interactive question tool (for example, OpenCode's `question` tool) rather than plain-text questions, so answers stay structured.
5. **Versioning.** Every PR must bump the `version` field in `package.json` (patch for fixes, minor for features, major for breaking changes). CI rejects PRs without a bump; merging to `main` runs CI only. Releases are published by pushing a tag `v<version>` (tag push `v*` triggers `release.yml`) — see ADR-0017.
