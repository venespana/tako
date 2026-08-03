# ADR 0010: FSD + Clean Arch + shared kernel architecture

## Status
Accepted

## Context
Tako has two "presentations": a CLI (non-interactive command handler) and a TUI (interactive with Ink + React). Both share business logic (talk to docker, SSH, config).

If we put everything in src/tui/ the CLI depends on the frontend. If everything in src/cli/ the TUI depends on the backend presentation. Both patterns are anti-patterns.

## Decision
**Three blocks**:
- `src/shared/`: common kernel (base UI kit, cross-cutting libraries, types).
- `src/domains/`: Clean Architecture per domain (docker, ssh, remotes, stacks, secrets, config). Each domain with `domain/`, `application/`, `infrastructure/` subfolders.
- `src/cli/` and `src/tui/`: two presentations that consume shared + domains.

The TUI follows FSD internally (app/pages/widgets/features/entities/shared inside src/tui/).

Strict dependency rules: shared ← domains ← cli/tui. Crossing between cli and tui is forbidden.

## Consequences
- (+) Clear boundaries, testable.
- (+) Entities are not duplicated (type in domain, React component in tui/entities).
- (+) Changing presentation (adding web app, REST API, MCP) does not touch domain.
- (-) Some initial boilerplate.
- (-) Learning curve for new contributors (FSD + Clean Arch).
- (~) Docker as a reference domain: replicate its structure for new domains.
