# Design: TUI Router on Zustand with History Stack

## Technical Approach

Introduce a single Zustand store as the TUI's router, owning `currentRoute`, `params`, and a bounded `history` stack. Navigation is split into **pure transition functions** (`navigate`, `goBack` — mirroring the existing `features/menu/navigation.ts` pure-function convention) and a **thin Zustand wrapper** that holds state and exposes them as actions. `App.tsx` subscribes via selectors, renders the screen mapped in a declarative `ROUTE_REGISTRY`, and conditionally renders `<Logo/>` based on each route's `showLogo` flag. The home cursor stays menu-local but resets to 0 on every route change via an effect. CLI is untouched — it never imports the store.

## Architecture Decisions

| Decision                 | Choice                                                                        | Alternatives                                                                   | Rationale                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Router placement         | `src/tui/app/router/`                                                         | `features/router/` (proposal)                                                  | `docs/architecture.md` line 27 assigns `router` to the `app/` layer. Architecture doc is authoritative per design rules.                         |
| Pure logic + store split | `router-logic.ts` (pure) + `router-store.ts` (Zustand)                        | All logic inside the store                                                     | Matches existing `navigation.ts` pattern; pure functions testable without store-reset pain.                                                      |
| Exit on empty history    | Inject `setExitHandler(fn)`; store calls it from `goBack`                     | (a) `goBack` returns boolean, App calls `exit`; (b) store imports Ink directly | Keeps store Ink-free and testable while satisfying the spec's "goBack invokes the exit primitive" literally (the bound Ink `exit` is what runs). |
| Cursor ownership         | Local state in `useHomeNavigation`, reset via `useEffect([currentRoute])`     | Cursor in router store                                                         | Spec mandates the store holds ONLY `currentRoute`/`params`/`history`. Cursor is home-menu UI state.                                              |
| ViewState retirement     | Remove `ViewState` union, `enterSubmenu`/`exitSubmenu`, `submenu` view branch | Keep submenu view alongside router                                             | `tui-home-navigation` spec explicitly removes single-level submenu semantics; `getSelectable` shrinks to flat filtering.                         |

## Data Flow

```
useInput (App.tsx)
   │
   ├─ j/k / ↑↓ → useHomeNavigation.moveCursor (local cursor)
   ├─ Enter    → router.navigate(targetRoute, params)
   └─ Esc/⌫/h  → router.goBack()
                     │ history empty? ─→ setExitHandler-bound Ink exit()
                     │ else            ─→ pop → restore route + params

Zustand store: { currentRoute, params, history[] }   (cap 20, drop oldest)
        │
        ▼  selector
App.tsx: ROUTE_REGISTRY[currentRoute] → { Screen, showLogo }
         <Box>{showLogo && <Logo/>}<Screen/></Box>
```

## File Changes

| File                                                                                                                                         | Action | Description                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| `src/tui/app/router/types.ts`                                                                                                                | Create | `RouteName` union (10 routes), `RouteParams`, `HistoryEntry`.                                             |
| `src/tui/app/router/router-logic.ts`                                                                                                         | Create | Pure `navigate(state, route, params)`, `goBack(state)` returning `{ state, exited }`.                     |
| `src/tui/app/router/router-store.ts`                                                                                                         | Create | Zustand `create()` wrapping pure logic + `setExitHandler`.                                                |
| `src/tui/app/router/registry.ts`                                                                                                             | Create | `ROUTE_REGISTRY`: route → `{ Screen, showLogo }`.                                                         |
| `src/tui/app/router/index.ts`                                                                                                                | Create | Barrel.                                                                                                   |
| `src/tui/app/App.tsx`                                                                                                                        | Modify | Drop `useState<ViewState>`; subscribe to store; wire `setExitHandler(useApp().exit)`; render by registry. |
| `src/tui/app/useHomeNavigation.ts`                                                                                                           | Modify | Read `currentRoute` from store; own cursor + `useEffect` reset to 0.                                      |
| `src/tui/features/menu/types.ts`                                                                                                             | Modify | Remove `ViewState`; `ActionItem.kind` narrowed to `'action'` (drop `'submenu'`); add `route?: RouteName`. |
| `src/tui/features/menu/navigation.ts`                                                                                                        | Modify | Remove `enterSubmenu`/`exitSubmenu` and submenu branch of `getSelectable`.                                |
| `src/tui/features/menu/registry.ts`                                                                                                          | Modify | Map each home item to a `route` target.                                                                   |
| `src/tui/pages/HomePage.tsx`                                                                                                                 | Modify | Stop rendering `<Logo/>` (moves to `App.tsx`, conditional).                                               |
| `src/tui/pages/{RemotesAddPage,RemotesListPage,RemotesRmPage,RemotesUsePage,RemotesTestPage,DoctorPage,LogsPage,StatusPage,CleanupPage}.tsx` | Create | Stub screens (`<Text>route name</Text>`); real behavior ships per command use case.                       |
| `src/tui/widgets/{ActionMenu,KeyHints}.tsx`                                                                                                  | Modify | Drop `view`/`ViewState` prop; `KeyHints` always shows "back" hint.                                        |
| `package.json`                                                                                                                               | Modify | Add `zustand` dependency.                                                                                 |

## Interfaces / Contracts

```ts
// router/types.ts
export type RouteName =
  | 'home'
  | 'remotes.add'
  | 'remotes.list'
  | 'remotes.rm'
  | 'remotes.use'
  | 'remotes.test'
  | 'doctor'
  | 'logs'
  | 'status'
  | 'cleanup';
export type RouteParams = Record<string, unknown>;
export interface HistoryEntry {
  route: RouteName;
  params: RouteParams;
}

// router/router-store.ts
interface RouterState {
  currentRoute: RouteName;
  params: RouteParams;
  history: HistoryEntry[];
  navigate: (route: RouteName, params?: RouteParams) => void;
  goBack: () => void;
}
export function setExitHandler(fn: () => void): void; // wired once from App via useApp().exit

// router/registry.ts
export const ROUTE_REGISTRY: Record<RouteName, { Screen: React.FC; showLogo: boolean }>;
// Logo ON:  home, remotes.add/list/rm/use/test
// Logo OFF: doctor, logs, status, cleanup
```

`navigate` dedup: same route → `set({ params })`, history untouched. Cap: `[...history, prev].slice(-20)`.

## Testing Strategy

| Layer       | What                                                                         | Approach                                                                                                           |
| ----------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Unit        | `router-logic.ts` pure `navigate`/`goBack` (push, dedup, cap-20, pop, empty) | `vitest`, no React — direct input/output asserts.                                                                  |
| Unit        | `router-store.ts` Zustand wrapper + `setExitHandler`                         | `setExitHandler(vi.fn())`, call `goBack()` on empty history, assert mock called.                                   |
| Unit        | `registry.ts`                                                                | Assert all 10 routes present; `showLogo` flags match policy.                                                       |
| Integration | `App.tsx` flow via `ink-testing-library`                                     | Render → Enter on item → screen swaps; Esc → back; Esc on home → exit mock called; cursor resets after round trip. |
| Guard       | CLI isolation                                                                | Static check: zero `router-store` imports under `src/cli/`.                                                        |

TDD per `openspec/config.yaml` (`apply.tdd: true`): RED on logic first, then store, then App integration.

## Threat Matrix

N/A — no routing (HTTP), shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. Change is TUI-internal navigation state only.

## Migration / Rollout

No data migration, feature flags, or phased rollout. Structurally additive. Rollback per proposal: delete `src/tui/app/router/`, remove `zustand`, `git checkout` the modified files. Add `zustand` (tree-shakeable, React 19 / Ink 7 compatible).

## Open Questions

- [ ] **Remotes submenu routing**: the canonical route set forbids a bare `remotes` route, yet `tui-home-navigation` spec says selecting the remotes item "navigates to the remotes submenu route" and "leaves home". Default taken: **flatten** — the 5 `remotes.*` routes become first-class home items, the `remotes` parent + `submenu` kind retire. Conflicts with literal "selecting remotes leaves home" scenario. Needs spec owner confirmation (or a spec amendment adding a `remotes` route).
- [ ] Should `App.tsx` keep its `dispatch` prop, or do page stubs wire their own use cases (e.g. `DoctorPage` calls `CheckHostDependencies` on mount)? Default: stubs render placeholder text this iteration; dispatch wiring moves into pages when each command use case lands.
