# ADR 0006: GitOps via tags

## Status
Accepted

## Context
Deploy on push al branch main es ruidoso: cada commit en progreso se deploya, incluso si no está listo. Queríamos deploy deliberado.

## Decision
**Deploy en push de tags** (patrón `v*`), no en push a main. Tag = release = deploy. Workflow GitHub Actions se dispara en `on: push: tags: ['v*']`.

## Consequences
- (+) Deploy deliberado: nada llega al server por accidente.
- (+) Rollback trivial: crear tag anterior.
- (+) Versionado semántico obligatorio (`v1.2.3`), trazabilidad clara.
- (-) Requiere disciplina de tagging.
- (-) Para experimentos rápidos, hay que hacer commit directo en el server o usar branch temporal.
