# Proposal: TUI Router on Zustand with History Stack

## Intent

TUI navigation lives in `useState` with a flat `ViewState` union (`list` | single-level `submenu`). `Esc` always returns to the home list, there is no multi-screen history, and screen identity is ad-hoc. As real command screens (`remotes.add`, `doctor`, `logs`, …) land this breaks down: deep flows need real back navigation and each screen needs a stable route. This change replaces ad-hoc view state with a **Zustand router** (route + params + history stack) so any screen can navigate to any other and `Esc` returns to the *previous* screen. The CLI is untouched — it prints directly and never touches the router.

## Scope

### In Scope
- Zustand store: `currentRoute`, `params`, `history` stack, `navigate(route, params)`, `goBack()`.
- Declarative route registry mapping route names → screen component + `showLogo` flag.
- Routes: `home`, `remotes.add`, `remotes.list`, `remotes.rm`, `remotes.use`, `remotes.test`, `doctor`, `logs`, `status`, `cleanup`.
- `App.tsx` subscribes to the store and renders the active screen.
- Logo visible only on `home` and submenu routes — not detail/form screens.
- Add `zustand` dependency.

### Out of Scope
- Real command-screen *behavior* (each command's use case ships separately).
- `install`/`update`/`rollback` routes (hidden until their use cases exist).
- CLI changes — CLI stays router-free, outputs directly.

## Capabilities

### New Capabilities
- `tui-router`: Zustand-backed router — route state, params, history stack, `navigate`/`goBack`, route registry, per-route logo visibility.

### Modified Capabilities
- `tui-home-navigation`: back semantics change from single-level submenu + `restoreCursor` to history-stack pop; selection dispatches via `navigate()` instead of direct handler calls.

## Approach

A `features/router` store holds `{ currentRoute, params, history }`. `navigate(route, params)` pushes the prior route onto the stack; `goBack()` pops it (no-op when empty, stays on current screen). A declarative registry maps each route name to its screen component and a `showLogo` flag. `App.tsx` reads `currentRoute` and renders the mapped screen, wrapping in `<Logo/>` only when the flag is set. Submenu state becomes a route; `navigation.ts` shrinks to cursor math scoped to `home`; `useHomeNavigation` migrates from `useState` to store selectors.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/tui/features/router/` | New | Zustand store, route registry, route types |
| `src/tui/app/App.tsx` | Modified | subscribe to store, render by route |
| `src/tui/app/useHomeNavigation.ts` | Modified | read state from store |
| `src/tui/features/menu/{navigation,types}.ts` | Modified | submenu → route; `ViewState` retired |
| `src/tui/pages/` | New | per-route screens (stubs for unimplemented) |
| `src/tui/widgets/Logo.tsx` | Modified | conditional on route flag |
| `package.json` | Modified | add `zustand` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| New runtime dep (zustand) | Low | Tiny, tree-shakeable; React 19 / Ink 7 compatible |
| History stack grows unbounded | Low | Cap depth; reset-to-home beyond N |
| Cursor restore lost across routes | Med | Carry cursor index in route `params` |
| Breaking `tui-home-navigation` tests | Med | Migrate tests alongside; strict TDD per config |

## Rollback Plan

Structurally additive. Revert: delete `src/tui/features/router/`, remove `zustand` from `package.json`, and `git checkout` `App.tsx`/`useHomeNavigation.ts`/`navigation.ts`/`types.ts`/`HomePage.tsx`. No host state, compose files, or templates touched.

## Dependencies

- `zustand` (new) — state container, React 19 compatible.

## Success Criteria

- [ ] All 10 routes reachable; `Esc`/`goBack` returns to the previous screen, not always home.
- [ ] Logo renders only on `home` + submenu routes; hidden on detail/form routes.
- [ ] Router state lives entirely in the Zustand store; no `useState` for view/route.
- [ ] `src/cli/` has zero imports of the router store.
- [ ] `bun run test`, `typecheck`, `lint`, `build` clean.
