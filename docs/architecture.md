# Architecture

Tako combines two architectural styles:

- **Frontend (TUI)**: Feature Sliced Design (FSD).
- **Backend (CLI)**: Clean Architecture by domain.
- **Shared kernel**: common layer consumed by both.

## Structure

```
src/
├── shared/                     # COMMON KERNEL CLI + TUI
│   ├── ui/                     # ink base kit (Button, Badge, Text)
│   ├── lib/                    # fs utils, logger, picocolors wrappers
│   ├── types/                  # Result, Maybe
│   └── errors/                 # TakoError classes
├── domains/                    # CLEAN ARCH BY DOMAIN
│   └── docker/                 # reference domain (MVP)
│       ├── domain/             # types: Container, Stack, Image
│       ├── application/        # use cases: ListStacks, DeployStack, GetLogs
│       └── infrastructure/     # DockerodeClient (local), SshDockerClient (via SSH)
├── cli/                        # CLI presentation
│   ├── index.ts                # entry, parse argv
│   └── commands/               # thin handlers: parse args → call use case → print
└── tui/                        # TUI presentation (FSD)
    ├── app/                    # App.tsx, providers, router, theme
    ├── pages/                  # screens
    ├── widgets/                # composite blocks
    ├── features/               # user-facing actions UI
    ├── entities/               # entity views (React components)
    └── shared/                 # TUI-specific shared (theme tokens, nav)
```

## Dependency rules (strict)

```
shared      → (nobody)
domains/*   → shared
cli/*       → domains/* + shared
tui/*       → domains/* + shared
```

FORBIDDEN:

- `tui/*` importing from `cli/*` (frontend does not know backend presentation).
- `cli/*` importing from `tui/*` (the reverse).
- `domains/*` importing from `cli/*` or `tui/*` (domain does not know presentations).

## Managed tension: duplicated entities

FSD wants `tui/entities/`. Clean Arch wants `domains/X/domain/`. They are NOT duplicated:

- The **type** (TS interface) of an entity lives in `domains/X/domain/`.
- The **React component** that renders it lives in `tui/entities/`. It imports the type from the domain.

Same with features: the **use case** lives in `domains/X/application/`, the **UI flow** that invokes it lives in `tui/features/`.

## The docker domain as reference

For the MVP, only the docker domain is implemented. It is the most complex and the best template to replicate later. When you add a new domain (ssh, remotes, stacks, secrets, config), replicate the structure of docker.

Each domain has:

- `domain/`: pure types and rules. Zero external dependencies.
- `application/`: use cases that orchestrate domain + infrastructure.
- `infrastructure/`: external adapters. They implement domain interfaces.

**Key rule**: `application/` declares interfaces (ports), `infrastructure/` implements them (adapters). `application/` never imports dockerode directly.

## Related stack

See [stack.md](stack.md) for technical detail of libraries.
