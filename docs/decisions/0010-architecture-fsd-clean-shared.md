# ADR 0010: Arquitectura FSD + Clean Arch + shared kernel

## Status
Accepted

## Context
Tako tiene dos "presentations": un CLI (command handler no-interactivo) y un TUI (interactivo con Ink + React). Ambos comparten lógica de negocio (talk to docker, SSH, config).

Si ponemos todo en src/tui/ el CLI depende del frontend. Si todo en src/cli/ el TUI depende del backend presentation. Ambos patrones son anti-patterns.

## Decision
**Tres bloques**:
- `src/shared/`: kernel común (UI kit base, librerías cross-cutting, tipos).
- `src/domains/`: Clean Architecture por dominio (docker, ssh, remotes, stacks, secrets, config). Cada dominio con sub-carpetas `domain/`, `application/`, `infrastructure/`.
- `src/cli/` y `src/tui/`: dos presentations que consumen shared + domains.

El TUI sigue FSD internamente (app/pages/widgets/features/entities/shared dentro de src/tui/).

Reglas de dependencia strict: shared ← domains ← cli/tui. Prohibido cruzar entre cli y tui.

## Consequences
- (+) Límites claros, testable.
- (+) Entities no se duplican (tipo en domain, componente React en tui/entities).
- (+) Cambiar presentation (añadir web app, API REST, MCP) no toca domain.
- (-) Algo de boilerplate inicial.
- (-) Curva de aprendizaje para contribuidores nuevos (FSD + Clean Arch).
- (~) Docker como dominio referente: replica su estructura para nuevos dominios.
