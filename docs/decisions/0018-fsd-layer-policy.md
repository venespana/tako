# ADR 0018: FSD layer policy — grandfathered widgets, single-use rule, Steiger as arbiter

## Status

Accepted

## Context

`src/tui/` adopted FSD v2.1, but two authorities disagree on what that means:

- `AGENTS.md` mandates a 6-layer structure (`app/`, `pages/`, `widgets/`, `features/`, `entities/`, `shared/`) with widgets as a first-class layer.
- The bundled FSD v2.1 skill (`.agents/skills/feature-sliced-design/`) discourages the widgets layer and classifies single-use slices as an anti-pattern (`insignificant-slice`).

The concrete conflict is real, not theoretical: `features/tasks/` holds 6 slices (`workspace`, `job-list`, `job-form`, `job-history`, `dry-run-preview`, `install`) with exactly one consumer — `pages/tasks`. There is also a live boundary violation caused by input-contract ownership: `widgets/action-menu` imports `RenderableActionGroup` from `features/menu`, meaning a widget depends upward on a feature to know its own input type.

No tool arbitrates any of this today: FSD layer direction is not covered by ESLint zones, and nothing checks slice significance.

## Decision

### 1. Widgets layer is grandfathered — not extended

`widgets/app-shell` and `widgets/action-menu` stay. However, creating a **new** widget or feature slice requires a real second consumer — "not hypothetically", per the skill. App-wide layout lives in `app/`; screen-specific composition lives in `pages/`; shared UI without business context lives in `shared/ui/`.

### 2. Single-use rule: one consumer → the code lives in that consumer

Code used by exactly one page lives in that page. Concretely:

- `features/tasks/*` is absorbed into `pages/tasks` as segments (phase F2), with the page's public API in `pages/tasks/index.ts`.
- Promotion back to a feature slice happens only when a second real consumer appears.

### 3. Entities stay conservative

`entities/job` remains: it has 2 real consumers on different layers. No new entities without the same threshold.

### 4. Steiger is the structural FSD arbiter

[Steiger](https://github.com/feature-sliced/steiger) is adopted for FSD-specific structural checks (`insignificant-slice`, `excessive-slicing`). Division of labor:

| Concern                | Arbiter      |
| ---------------------- | ------------ |
| FSD slice significance | Steiger      |
| FSD layer direction    | ESLint zones |
| Dead code              | knip         |

Mechanical adoption (Steiger, knip, and the missing ESLint zones) lands in phase F4.

### 5. Same-layer cross-imports follow FSD strategies A–D

When two slices on the same layer need to share logic, resolve in this order: **A** merge the slices, **B** push shared logic down to `entities/`, **C** compose from the upper layer (IoC via the page), **D** public-API-only access through the slice's `index.ts`. The `@x` notation is reserved for the entities layer. Any rule break requires a documented decision — a code comment explaining why strategies A–D do not apply, or an ADR.

### 6. Type-inversion precedent: the widget owns its input contract

`RenderableActionGroup` moves from `features/menu` into `widgets/action-menu` (phase F2). The widget defines its input contract; upper layers conform. This deletes the widgets→features import direction and resolves the ownership inversion: a component's props types live with the component, not with one of its consumers.

## Consequences

- (~) Phase F2 churn: absorbing `features/tasks` touches ~30 files, behavior-preserving.
- (+) A documented promotion path replaces case-by-case judgment: page → (second real consumer appears) → feature/entity.
- (+) The bundled FSD skill and the repo's ADRs stop contradicting each other.
- (+) The action-menu type inversion gets a mechanical fix instead of a documented exception.
- (~) Steiger/knip adoption is deferred to F4; until then, slice significance and dead code are `review-only` checks.

## References

- FSD v2.1 skill: `.agents/skills/feature-sliced-design/` (widgets callout, `insignificant-slice`, cross-import strategies A–D)
- ADR 0010: FSD + Clean Arch + shared kernel architecture
- Plan: `odd/tasks/architecture-layers.md` (phases F2, F4)
