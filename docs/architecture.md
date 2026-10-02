# Architecture

Tako is **one server with two clients**, in-process: `src/services/` exposes complete
domain functions, consumed equally by the interactive TUI (FSD) and the
non-interactive CLI. All composition and adapter wiring is private inside
`services/` and `domains/`. See [ADR-0019](decisions/0019-services-layer.md) for the
model and [ADR-0018](decisions/0018-fsd-layer-policy.md) for the FSD layer policy.

## Structure

```text
src/
├── tui/          # interactive client — Feature Sliced Design
│   ├── app/      # App.tsx, app-router, generated route tree, providers
│   ├── pages/    # screens; single-use code lives in its page
│   ├── widgets/  # grandfathered composite blocks (ADR-0018: no new ones)
│   ├── features/ # user-facing actions reused across pages
│   ├── entities/ # business domain views (React components)
│   └── shared/   # TUI-specific shared (theme tokens, nav)
├── cli/          # non-interactive client — parse → call service → print
├── services/     # in-process API layer (ADR-0019) — arrives in phase F3
├── domains/      # Clean Architecture per domain
└── shared/       # shared kernel (currently 2 files, see below)
```

TUI routing is file-based: route shims live in `src/tui/app/routes/`
(convention documented in [tui-routing.md](tui-routing.md))
and are wired into `src/tui/app/routes.generated.ts` by
`bun run generate:routes`.

## Domains

Four domains are implemented, each split Clean-Architecture style:

| Domain    | Responsibility                                           |
| --------- | -------------------------------------------------------- |
| `docker`  | stack lifecycle and prune over local Docker or SSH       |
| `remotes` | SSH connection configurations, secrets, remote execution |
| `system`  | host tool checks and dependencies                        |
| `agent`   | unattended job execution (daemon, install, protocol)     |

Each domain has:

- `domain/`: pure types and rules. Zero external dependencies.
- `application/`: use cases that orchestrate domain + infrastructure.
- `infrastructure/`: external adapters (ssh2, conf, dockerode, bun:sqlite). They implement domain interfaces.

**Key rule**: `application/` declares interfaces (ports), `infrastructure/` implements
them (adapters). `application/` never imports adapter libraries directly.

## Services layer (ADR-0019)

`src/services/<domain>.ts` is the in-process API consumed by both clients. The
contract:

- **Minimal parameters in** (request-like), **typed results out** (response-like);
  streaming results are `AsyncIterable`.
- The public surface contains zero infrastructure or adapter types.
- All wiring (auth resolution, SSH toolstack, `conf` stores) is private.

> **Status**: this section describes the contract. The layout is delivered in
> **phase F3** (plan: `odd/tasks/architecture-layers.md`); until then, cli and tui
> compose domains directly at the sites scheduled for convergence.

The CLI is a non-interactive endpoint: parameters via flags/stdin, parse → call →
print, zero UX. Interactive flows live only in the TUI.

## Shared kernel (real inventory)

`src/shared/` currently holds two files:

- `lib/session-password.ts`
- `lib/version.ts`

There is no `types/Result`, `types/Maybe`, or `errors/TakoError` — earlier drafts
of this document described a larger kernel than the one that exists. Grow
`shared/` only when two layers actually need the same code.

## Dependency rules

Allowed directions (ADR-0019 target model):

```text
tui/       → services/ + tui-internal layers + shared/
cli/       → services/ + shared/
services/  → domains/ + shared/
domains/   → shared/
```

Enforcement, honestly stated — a rule is either mechanically enforced today or it is
`review-only` (marked rules get mechanical checks in phase F4; FSD additionally gets
[Steiger](https://github.com/feature-sliced/steiger), per ADR-0018):

| Rule                                                                  | Enforcement                      |
| --------------------------------------------------------------------- | -------------------------------- |
| `tui` must not import `cli`                                           | enforced (ESLint zone)           |
| `cli` must not import `tui`                                           | enforced (ESLint zone)¹          |
| `agent` imports `remotes/application` ports type-only                 | enforced (ESLint zone + syntax)  |
| `bun:sqlite` imports only in agent persistence + integration fixtures | enforced (ESLint resolver)       |
| `shared` imports from nobody                                          | review-only (F4 zone)            |
| `domains` must not import presentation (`cli`/`tui`)                  | review-only (F4 zone)            |
| `application` must not import `infrastructure`                        | review-only (F4 zone)            |
| `domain/` purity (zero external dependencies)                         | review-only (F4 zone)            |
| FSD layer direction inside `tui`                                      | review-only (F4 zones + Steiger) |
| `cli`/`tui` must not import `domains` directly (via `services`)       | review-only — arrives with F3    |
| `services`/`domains` must not import presentation                     | review-only — arrives with F3    |

¹ Transitional ADR-0014 exceptions are still active: `cli` may import
`tui/features/remotes/add-remote-wizard` and `tui/features/doctor`. Superseded by
ADR-0019; deleted in phase F3.

## Managed tension: duplicated entities

FSD wants `tui/entities/`. Clean Arch wants `domains/X/domain/`. They are NOT duplicated:

- The **type** (TS interface) of an entity lives in `domains/X/domain/` (re-exported
  through `services/` once F3 lands).
- The **React component** that renders it lives in `tui/entities/`. It imports the type — never a copy.

Same with features: the **use case** lives in `domains/X/application/`, the **UI flow**
that invokes it lives in `tui/features/`.

## TUI layer policy

FSD layer policy — when a widget, feature, or entity slice may exist, and how
same-layer cross-imports are resolved — is defined in
[ADR-0018](decisions/0018-fsd-layer-policy.md). Summary: widgets are grandfathered
(`app-shell`, `action-menu`), no new widget/feature/entity slice without a real second
consumer, single-use code stays in its page.

## Related stack

See [stack.md](stack.md) for technical detail of libraries.
