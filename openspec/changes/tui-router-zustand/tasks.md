# Tasks: tui-router-zustand

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~500–600 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (router-infra + page-stubs) → PR 2 (feature-modifications + app-wiring + tests) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

## ⚠️ Open Question — Remotes Flattening

The design took a **default decision** to flatten remotes: the 5 `remotes.*` routes become first-class home items, the `remotes` parent and `submenu` kind retire. This conflicts with `tui-home-navigation` spec line 51–55 which says selecting the remotes item "navigates to the remotes submenu route" — implying a bare `remotes` route should exist.

**If remotes are NOT flattened**: `features/menu/types.ts` must keep a `remotes` route + `submenu` kind, and the route set would need a bare `remotes` route. All tasks referencing `kind: 'submenu'` retirement would need adjustment.

**Confirmation required before apply from spec owner or team.**

## Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Router infra + page stubs | PR 1 | `vitest src/tui/app/router` | N/A (pure unit) | Delete `src/tui/app/router/` + 9 page stubs |
| 2 | Feature modifications + app wiring + tests | PR 2 | `vitest src/tui` | `npm run tui` smoke | Revert 7 modified files |

## Phase 1: Router Infrastructure

- [ ] 1.1 Create `src/tui/app/router/types.ts` with `RouteName` union (10 routes), `RouteParams`, `HistoryEntry`
- [ ] 1.2 Create `src/tui/app/router/router-logic.ts` with pure `navigate(state, route, params)` and `goBack(state)` — push, cap-20, dedup, pop, exit signal
- [ ] 1.3 Create `src/tui/app/router/router-store.ts` wrapping pure logic in Zustand `create()`; expose `navigate`, `goBack`; add `setExitHandler`
- [ ] 1.4 Create `src/tui/app/router/registry.ts` with `ROUTE_REGISTRY` — all 10 routes, `Screen` (stub), `showLogo` flags (on: home + remotes.*; off: doctor/logs/status/cleanup)
- [ ] 1.5 Create `src/tui/app/router/index.ts` barrel exporting all router symbols

## Phase 2: Page Stubs

- [ ] 2.1 Create `src/tui/pages/RemotesAddPage.tsx` — stub `<Text>remotes.add</Text>`
- [ ] 2.2 Create `src/tui/pages/RemotesListPage.tsx` — stub `<Text>remotes.list</Text>`
- [ ] 2.3 Create `src/tui/pages/RemotesRmPage.tsx` — stub `<Text>remotes.rm</Text>`
- [ ] 2.4 Create `src/tui/pages/RemotesUsePage.tsx` — stub `<Text>remotes.use</Text>`
- [ ] 2.5 Create `src/tui/pages/RemotesTestPage.tsx` — stub `<Text>remotes.test</Text>`
- [ ] 2.6 Create `src/tui/pages/DoctorPage.tsx` — stub `<Text>doctor</Text>`
- [ ] 2.7 Create `src/tui/pages/LogsPage.tsx` — stub `<Text>logs</Text>`
- [ ] 2.8 Create `src/tui/pages/StatusPage.tsx` — stub `<Text>status</Text>`
- [ ] 2.9 Create `src/tui/pages/CleanupPage.tsx` — stub `<Text>cleanup</Text>`

## Phase 3: Feature Modifications

- [ ] 3.1 Modify `src/tui/features/menu/types.ts` — remove `ViewState` union; narrow `ActionItem.kind` to `'action'` only (drop `'submenu'`); add `route?: RouteName` field
- [ ] 3.2 Modify `src/tui/features/menu/navigation.ts` — remove `enterSubmenu`/`exitSubmenu` helpers; remove submenu branch of `getSelectable`; keep only flat-filter selectable logic
- [ ] 3.3 Modify `src/tui/features/menu/registry.ts` — map each home item to its `route` target; for remotes items use `route: 'remotes.add'|'remotes.list'|'remotes.rm'|'remotes.use'|'remotes.test'`
- [ ] 3.4 Modify `src/tui/pages/HomePage.tsx` — remove `<Logo/>` rendering (Logo moves to App.tsx conditional)
- [ ] 3.5 Modify `src/tui/widgets/KeyHints.tsx` — drop `view`/`ViewState` prop; always show "back" hint
- [ ] 3.6 Modify `src/tui/widgets/ActionMenu.tsx` — drop `view`/`ViewState` prop; use flat selectable list only

## Phase 4: App Wiring

- [ ] 4.1 Modify `src/tui/app/App.tsx` — drop `useState<ViewState>`; subscribe to router store via selector; call `setExitHandler(useApp().exit)`; render `ROUTE_REGISTRY[currentRoute].Screen`; wrap in `<Box><showLogo&&<Logo/><Screen/></Box>`
- [ ] 4.2 Modify `src/tui/app/useHomeNavigation.ts` — read `currentRoute` from store; own cursor state; add `useEffect(() => setCursor(0), [currentRoute])` for cursor reset
- [ ] 4.3 Add `zustand` to `package.json` dependencies

## Phase 5: Testing

- [ ] 5.1 Write unit tests for `src/tui/app/router/router-logic.ts` — test push, cap-20, dedup, pop, empty-history signal (`vitest`, no React)
- [ ] 5.2 Write unit tests for `src/tui/app/router/router-store.ts` — mock `setExitHandler`, call `goBack()` on empty history, assert mock called
- [ ] 5.3 Write unit tests for `src/tui/app/router/registry.ts` — assert all 10 routes present; assert `showLogo` flags match policy
- [ ] 5.4 Write integration test for `App.tsx` (ink-testing-library) — Enter on item → screen swaps; Esc → back; Esc on home → exit mock called; cursor resets after round trip
- [ ] 5.5 Static guard: assert zero `router-store` imports under `src/cli/` (grep or equivalent check in test pipeline)
