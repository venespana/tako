# ADR 0019: Services layer — Tako as one server with two clients

## Status

Accepted (supersedes ADR 0014's cli→tui exception; see Decision 6)

## Context

The SSH-stack + `conf` wiring (auth resolution, toolstack assembly, store construction) is hand-duplicated at 6 sites across `src/cli` and `src/tui`, kept in sync only by comments. The CLI mirrors TUI composition instead of sharing it. ADR 0014 opened a managed cli→tui import exception to let interactive flows render TUI wizards, and an audit on `feature/remote-agent` found boundary violations invisible to CI (no zones covering them).

The root cause is the missing middle layer: both presentations compose the backend themselves.

## Decision

Tako is modeled as **one server with two clients**, in-process (no network). The server is a services layer; the clients are the TUI (interactive, FSD) and the CLI (non-interactive endpoints).

### 1. Services expose complete domain functions

`src/services/<domain>.ts` (starting with `remotes`, `agent`, `docker`, `system`) exposes complete domain functions:

- **In**: minimal parameter objects (request-like).
- **Out**: typed results (response-like); streaming results as `AsyncIterable`.
- The public surface contains **zero infrastructure or adapter types** — consumers never see `ssh2`, `conf`, or dockerode types.

### 2. All composition and wiring is private inside services

Auth resolution, SSH toolstack assembly, and `conf` store construction are implementation details of the services layer, written once.

### 3. Final top-level layout

```text
src/
├── tui/        # interactive client (FSD)
├── cli/        # non-interactive client (Commander)
├── services/   # in-process API layer (the server)
├── domains/    # Clean Architecture per domain
└── shared/     # shared kernel
```

### 4. Dependency rules

```text
tui/       → services/ + tui-internal layers + shared/
cli/       → services/ + shared/
services/  → domains/ + shared/
domains/   → shared/
```

Forbidden:

- `cli/` or `tui/` importing `domains/` directly — contract types are re-exported through `services/`.
- `services/` or `domains/` importing presentation (`cli/` or `tui/`).
- `tui/` ↔ `cli/` in either direction.

### 5. CLI is a non-interactive endpoint

CLI commands receive parameters via flags/stdin (xargs-style, composable), then parse → call a service → print. Zero UX: no spinners, no wizards, no interactive prompts. Interactive flows live only in the TUI.

### 6. ADR 0014's cli→tui exceptions are superseded — transitionally

ADR 0014 allowed `cli` to import `tui/features/remotes/add-remote-wizard` and `tui/features/doctor` so interactive flows could render TUI. Once doctor and add-remote logic lives behind services (phase F3), those exceptions are deleted (ESLint `except` globs and their documentation). Until F3 lands, the exceptions remain **transitional**: still active in code, scheduled for deletion, not a pattern to extend.

### 7. DI change in the TUI

Route shims stop injecting gateways via props and import services directly. Tests mock service modules instead of injecting fakes through the component tree.

## Consequences

- (~) Phase F3 migration: all six duplicated wiring sites converge into services; behavior-preserving, existing suite as the safety net.
- (~) Test strategy changes in the TUI: module mocks replace injected fakes.
- (+) The services signature is the stability contract for both clients; presentations stop mirroring each other's composition.
- (+) ADR 0014's exception becomes a countdown instead of a permanent carve-out.
- (~) Until F4 adds ESLint zones for the new rules, most of section 4 is `review-only`.

## References

- ADR 0014: `tako remote add` — singular naming, v0 secrets posture, and managed cli→tui exception (superseded exception)
- ADR 0010: FSD + Clean Arch + shared kernel architecture
- Plan: `odd/tasks/architecture-layers.md` (phase F3)
