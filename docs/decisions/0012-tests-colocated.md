# ADR 0012: Tests unitarios co-localizados

## Status
Accepted

## Context
El maintainer prefiere tests unitarios junto al código que prueban (co-localización), patrón común en proyectos TS modernos. Pero los tests de integración y e2e requieren setup distinto (contenedores reales, host docker disponible) y son lentos, no deben correrse en cada save.

## Decision
**Tres niveles de tests separados por ubicación y naming**:
- `*.test.ts` / `*.test.tsx` → unitarios, co-localizados junto al código en `src/`.
- `*.integ.test.ts` → integración, en `tests/integration/`.
- `*.e2e.ts` → e2e, en `tests/e2e/`.

Vitest con feature `projects` para separar las 3 suites con configs distintas.

## Consequences
- (+) Tests unitarios fáciles de encontrar (junto al código que prueban).
- (+) Refactoring más fácil (mover código mueve su test).
- (+) Velocidad: unitarios <100ms, se corren en cada save.
- (+) Integración y e2e no entorpecen el ciclo de desarrollo rápido.
- (-) Requiere config Vitest con `projects` (no es default).
- (-) Dos carpetas dedicadas (tests/integration, tests/e2e) además de tests co-localizados.
