---
name: reactjs-best-practices
description: "Trigger: React, ReactJS, JSX, TSX, hooks, components, React 19. Enforce component purity, hooks rules, SOLID/KISS/DRY, and performance optimization in React."
license: Apache-2.0
metadata:
  author: venespana
  version: "1.1"
---

## Activation Contract

Load when writing, reviewing, or refactoring React components (`.jsx`/`.tsx`). Applies to: components, hooks, context, state management, effects, performance optimization.

## Hard Rules

### Correctness
1. **Components and hooks are pure.** Same input → same output. No side effects in render body.
2. **Props and state are immutable.** Never mutate directly.
3. **Hooks rules are non-negotiable.** Top-level only, no conditionals around hooks.
4. **Effects have cleanup.** Every `useEffect` with subscription/timer/listener returns cleanup.
5. **Stable keys in lists.** No array index as key for dynamic lists.
6. **Composition over inheritance.** Compose with props/children.
7. **One responsibility per component.** Split if mixing fetching + presentation + layout.

### Performance (CRITICAL)
8. **Eliminate async waterfalls.** Use `Promise.all` for independent operations. Never `await` sequentially what can run in parallel.
9. **Avoid barrel file imports.** Import from specific files (`library/Module`) not barrel (`library`) to reduce bundle size.
10. **Code-split heavy components.** Use `React.lazy` + `Suspense` for large optional dependencies.
11. **Derive state during render, not in effects.** If state can be computed from props/other state, calculate inline. No `useEffect` to sync.
12. **Functional `setState`.** Use `setState(prev => ...)` when next value depends on previous.
13. **No inline component definitions.** Defining a component inside another remounts it every render.
14. **Passive scroll listeners.** Use `{ passive: true }` on scroll/touch event listeners.

### Code Quality
15. **Comments are WHY only.** Names carry intent.
16. **No magic numbers/strings.** Named constants.
17. **Prefer early return over nested `if`.** Guard clauses first, main logic at base indentation. Max 2 levels of nesting.

## Decision Gates

| Situation | Action |
|---|---|
| Side effect in render body | Move to event handler or `useEffect` |
| Sequential awaits with no dependency | Wrap in `Promise.all` |
| Importing from barrel file | Import from specific module path |
| Heavy component static import | Use `React.lazy` + `Suspense` |
| State synced via `useEffect` | Derive during render or `useMemo` |
| `setState(value + 1)` | Use `setState(prev => prev + 1)` |
| Component defined inside component | Extract to module scope |
| Scroll listener without passive flag | Add `{ passive: true }` |
| Index as key in dynamic list | Replace with stable ID |
| 3+ levels of nested `if` | Flatten with guard clauses (early return) |
| `if` branch returns but `else` still present | Drop the `else` |
| Prop drilling > 2 levels | Consider context or composition |

## Execution Steps

1. Read `references/common-principles.md` for SOLID/YAGNI/KISS/DRY + naming/comment rules.
2. Read `references/ts-js-base.md` for shared TS/JS conventions.
3. Read the performance references under `references/react-perf-*.md` for the full rule set (55+ rules adapted from Vercel, Next.js excluded). Key files:
   - `react-perf-async.md` — CRITICAL: eliminate Promise waterfalls
   - `react-perf-bundle.md` — CRITICAL: barrel imports, code splitting
   - `react-perf-rerender-1.md` / `react-perf-rerender-2.md` — re-render optimization
   - `react-perf-client.md` — client data fetching + advanced patterns
   - `react-perf-rendering-1.md` / `react-perf-rendering-2.md` — rendering performance
   - `react-perf-js-1.md` / `react-perf-js-2.md` — JS micro-optimizations
4. Apply hard rules above to every component/hook touched.
5. For performance work: check for waterfalls, barrel imports, unnecessary re-renders, and missing code-splitting.

## Output Contract

Return: files modified, correctness issues fixed, performance anti-patterns removed, and any SRP splits made.

## References

- `references/common-principles.md` — SOLID, YAGNI, KISS, DRY, naming & comment convention.
- `references/ts-js-base.md` — ESM, async/await, error handling, config, logging, TypeScript strictness.
- `references/react-perf-*.md` — 9 performance reference files (55+ rules adapted from Vercel, Next.js excluded). Load the relevant category for the task at hand.
