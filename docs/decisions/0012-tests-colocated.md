# ADR 0012: Colocated unit tests

## Status

Accepted

## Context

The maintainer prefers unit tests next to the code they test (colocation), a common pattern in modern TS projects. But integration and e2e tests require a different setup (real containers, docker host available) and are slow, so they should not run on every save.

## Decision

**Three test levels separated by location and naming**:

- `*.test.ts` / `*.test.tsx` → unit, colocated next to the code in `src/`.
- `*.integ.test.ts` → integration, in `tests/integration/`.
- `*.e2e.ts` → e2e, in `tests/e2e/`.

Vitest with the `projects` feature to separate the 3 suites with different configs.

## Consequences

- (+) Unit tests easy to find (next to the code they test).
- (+) Easier refactoring (moving code moves its test).
- (+) Speed: unit <100ms, run on every save.
- (+) Integration and e2e do not slow down the fast dev loop.
- (-) Requires Vitest config with `projects` (not default).
- (-) Two dedicated folders (tests/integration, tests/e2e) in addition to colocated tests.
