# Tasks: tui-router-zustand

## Review Workload Forecast

| Field                   | Value                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------ |
| Estimated changed lines | ~500–600                                                                             |
| 400-line budget risk    | High                                                                                 |
| Chained PRs recommended | Yes                                                                                  |
| Suggested split         | PR 1 (router-infra + page-stubs) → PR 2 (feature-modifications + app-wiring + tests) |
| Delivery strategy       | ask-on-risk                                                                          |
| Chain strategy          | stacked-to-main                                                                      |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

## ⚠️ Decisión confirmada — Mantener submenu

El equipo confirmó mantener el submenu de remotes: la ruta `remotes` padre existe con `kind: 'submenu'`, y las 5 rutas `remotes.*` viven dentro del submenu. No se aplanan.

## Suggested Work Units

| Unit | Goal                                       | Likely PR | Focused test command        | Runtime harness     | Rollback boundary                           |
| ---- | ------------------------------------------ | --------- | --------------------------- | ------------------- | ------------------------------------------- |
| 1    | Router infra + page stubs                  | PR 1      | `vitest src/tui/app/router` | N/A (pure unit)     | Delete `src/tui/app/router/` + 9 page stubs |
| 2    | Feature modifications + app wiring + tests | PR 2      | `vitest src/tui`            | `npm run tui` smoke | Revert 7 modified files                     |

## Phase 1: Router Infrastructure

- [x] 1.1 Create `src/tui/app/router/types.ts` with `RouteName` union (11 routes: home + remotes + 5 remotes.* + 4 others), `RouteParams`, `HistoryEntry`
- [x] 1.2 Create `src/tui/app/router/router-logic.ts` with pure `navigate(state, route, params)` and `goBack(state)` — push, cap-20, dedup, pop, exit signal
- [x] 1.3 Create `src/tui/app/router/router-store.ts` wrapping pure logic in Zustand `create()`; expose `navigate`, `goBack`; add `setExitHandler`
- [x] 1.4 Create `src/tui/app/router/registry.tsx` with `ROUTE_REGISTRY` — all 11 routes, `Screen` (stub), `showLogo` flags (on: home + remotes.*; off: doctor/logs/status/cleanup)
- [x] 1.5 Create `src/tui/app/router/index.ts` barrel exporting all router symbols

## Phase 2: Page Stubs

- [x] 2.1 Create `src/tui/pages/RemotesAddPage.tsx` — stub `<Text>remotes.add</Text>`
- [x] 2.2 Create `src/tui/pages/RemotesListPage.tsx` — stub `<Text>remotes.list</Text>`
- [x] 2.3 Create `src/tui/pages/RemotesRmPage.tsx` — stub `<Text>remotes.rm</Text>`
- [x] 2.4 Create `src/tui/pages/RemotesUsePage.tsx` — stub `<Text>remotes.use</Text>`
- [x] 2.5 Create `src/tui/pages/RemotesTestPage.tsx` — stub `<Text>remotes.test</Text>`
- [x] 2.6 Create `src/tui/pages/DoctorPage.tsx` — stub `<Text>doctor</Text>`
- [x] 2.7 Create `src/tui/pages/LogsPage.tsx` — stub `<Text>logs</Text>`
- [x] 2.8 Create `src/tui/pages/StatusPage.tsx` — stub `<Text>status</Text>`
- [x] 2.9 Create `src/tui/pages/CleanupPage.tsx` — stub `<Text>cleanup</Text>`

## Phase 3: Feature Modifications

- [x] 3.1 Modify `src/tui/features/menu/types.ts` — kept `ViewState` (tests depend on it); added `route?: RouteName` to `ActionItem`; `ActionItemKind` = `'action' | 'submenu'`
- [x] 3.2 Modify `src/tui/features/menu/navigation.ts` — kept `enterSubmenu`/`exitSubmenu` helpers; updated `getSelectable` to flat-filter (submenu items excluded from flat list since routing handles them)
- [x] 3.3 Modify `src/tui/features/menu/registry.ts` — `remotes` item: `kind: 'submenu'`, `route: 'remotes'`; other items: direct route; remote sub-items live only in router registry
- [x] 3.4 Modify `src/tui/pages/HomePage.tsx` — removed `<Logo/>` (now in App.tsx conditional); removed `view` prop from `ActionMenu` and `KeyHints`
- [x] 3.5 Modify `src/tui/widgets/KeyHints.tsx` — dropped `view` prop; always shows back hint
- [x] 3.6 Modify `src/tui/widgets/ActionMenu.tsx` — dropped `view` prop; simplified list rendering

## Phase 4: App Wiring

- [x] 4.1 Rewrite `src/tui/app/App.tsx` — dropped `useState<ViewState>`; subscribes to router store; wires `setExitHandler(exit)`; renders `ROUTE_REGISTRY[currentRoute].Screen` conditionally with Logo
- [x] 4.2 Modify `src/tui/app/useHomeNavigation.ts` — reads `currentRoute` from store; own cursor; `useEffect(() => setCursor(0), [currentRoute])`
- [x] 4.3 `zustand` already in `package.json` at `^5.0.14` — no change needed

## Phase 5: Testing

- [x] 5.1 Unit tests for `src/tui/app/router/router-logic.ts` — push, cap-20, dedup, pop, empty-history signal (9 tests, all pass)
- [x] 5.2 Unit tests for `src/tui/app/router/router-store.ts` — `setExitHandler` wiring, `goBack()` on empty history (5 tests, all pass)
- [x] 5.3 Unit tests for `src/tui/app/router/registry.ts` — all 11 routes present, `showLogo` flags correct (4 tests, all pass)
- [ ] 5.4 Integration test for `App.tsx` (ink-testing-library) — not written (scope boundary)
- [x] 5.5 Static guard: `src/cli/` must not import `router-store` — test passes
