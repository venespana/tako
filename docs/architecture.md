# Arquitectura

Tako combina dos estilos arquitectónicos:

- **Frontend (TUI)**: Feature Sliced Design (FSD).
- **Backend (CLI)**: Clean Architecture por dominios.
- **Shared kernel**: capa común consumida por ambos.

## Estructura

```
src/
├── shared/                     # KERNEL común CLI + TUI
│   ├── ui/                     # ink kit base (Button, Badge, Text)
│   ├── lib/                    # fs utils, logger, picocolors wrappers
│   ├── types/                  # Result, Maybe
│   └── errors/                 # TakoError classes
├── domains/                    # CLEAN ARCH POR DOMINIO
│   └── docker/                 # dominio referente (MVP)
│       ├── domain/             # tipos: Container, Stack, Image
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

## Reglas de dependencia (strict)

```
shared      → (nadie)
domains/*   → shared
cli/*       → domains/* + shared
tui/*       → domains/* + shared
```

PROHIBIDO:
- `tui/*` importando de `cli/*` (frontend no conoce backend presentation).
- `cli/*` importando de `tui/*` (al revés).
- `domains/*` importando de `cli/*` o `tui/*` (dominio no conoce presentaciones).

## Tensión gestionada: entities duplicadas

FSD quiere `tui/entities/`. Clean Arch quiere `domains/X/domain/`. NO se duplican:

- El **tipo** (interface TS) de una entidad vive en `domains/X/domain/`.
- El **componente React** que lo renderiza vive en `tui/entities/`. Importa el tipo del dominio.

Igual con features: el **use case** vive en `domains/X/application/`, la **UI flow** que lo invoca vive en `tui/features/`.

## Dominio docker como referente

Para el MVP, solo se implementa el dominio docker. Es el más complejo y mejor template para replicar después. Cuando añadas un dominio nuevo (ssh, remotes, stacks, secrets, config), replica la estructura de docker.

Cada dominio tiene:
- `domain/`: tipos y reglas puras. Cero dependencias externas.
- `application/`: use cases que orquestan domain + infrastructure.
- `infrastructure/`: adaptadores externos. Implementan interfaces del domain.

**Regla clave**: `application/` declara interfaces (ports), `infrastructure/` las implementa (adapters). `application/` nunca importa dockerode directo.

## Stack relacionado

Ver [stack.md](stack.md) para detalle técnico de librerías.
