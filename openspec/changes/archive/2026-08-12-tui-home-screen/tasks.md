# Tasks: tako TUI home screen

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,400 (new) + ~50 (modified) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Foundation: version codegen + composition root + CLI export | PR 1 | `bun run typecheck` | `bun src/index.ts` (no args → TUI, `tako doctor` → CLI) | Delete `src/index.ts`, restore `package.json` bin, restore `cli/index.ts` |
| 2 | TUI infra: theme, types, pure navigation + registry + dispatch | PR 2 | `bun run test -- src/tui/features/menu/` | `bun src/index.ts` | Delete `src/tui/features/` and `src/tui/shared/` |
| 3 | UI: widgets, pages, App hook, integration tests | PR 3 | `bun run test -- src/tui/` | `bun src/index.ts` | Delete `src/tui/app/` and `src/tui/widgets/` and `src/tui/pages/` |

## Phase 1: Foundation (Composition Root + Codegen)

- [ ] 1.1 Create `src/shared/lib/version.ts` with `export const VERSION = '0.0.0'` (codegen target)
- [ ] 1.2 Create `scripts/generate-version.ts` — reads `package.json` → overwrites `version.ts`
- [ ] 1.3 Modify `package.json`: bin path → `src/index.ts`; build script prepends `bun scripts/generate-version.ts`
- [ ] 1.4 Modify `src/cli/index.ts`: export `runCli()` function, remove module-level `program.parse()`
- [ ] 1.5 Create `src/index.ts` — argv check → bare `tako` renders TUI, args delegate to `runCli()`
- [ ] 1.6 Modify `eslint.config.js`: add `import-x/no-restricted-paths` rule forbidding `tui↔cli` imports

## Phase 2: TUI Infrastructure (Theme + Navigation + Registry + Dispatch)

- [ ] 2.1 Create `src/tui/shared/theme.ts` — tokens: cursor glyph `❯`, cyan color, disabled dim style
- [ ] 2.2 Create `src/tui/features/menu/types.ts` — `ViewState`, `ActionItem`, `ActionGroup`, `DispatchMap` types
- [ ] 2.3 RED: Write `src/tui/features/menu/navigation.test.ts` — test `getSelectable`, `moveCursor` wrap/skip, `enterSubmenu`, `exitSubmenu`
- [ ] 2.4 GREEN: Create `src/tui/features/menu/navigation.ts` — pure functions per design spec
- [ ] 2.5 RED: Write `src/tui/features/menu/registry.test.ts` — assert exactly doctor + remotes groups/items
- [ ] 2.6 GREEN: Create `src/tui/features/menu/registry.ts` — declarative `ActionGroup[]`: Local(doctor), Remote(remotes-nav + disabled actions), Config()
- [ ] 2.7 Create `src/tui/features/menu/dispatch/index.ts` — default dispatch map wiring `doctor` → `CheckHostDependencies(LocalHostToolChecker)`

## Phase 3: UI Widgets and Pages

- [ ] 3.1 Create `src/tui/widgets/Logo.tsx` — centered ASCII logo component
- [ ] 3.2 Create `src/tui/widgets/ActionMenu.tsx` — renders groups/items; `❯` cyan on focused; greyed disabled; submenu items
- [ ] 3.3 Create `src/tui/widgets/KeyHints.tsx` — view-aware key hints bar (`↑↓/j k` `Enter/l` `h/Esc` `q`)
- [ ] 3.4 Create `src/tui/widgets/VersionBar.tsx` — footer rendering `VERSION` constant
- [ ] 3.5 Create `src/tui/pages/HomePage.tsx` — composes Logo + ActionMenu + KeyHints + VersionBar
- [ ] 3.6 Widget unit tests: Logo render, ActionMenu cursor glyph, KeyHints view-aware, VersionBar value

## Phase 4: App Hook + Integration

- [ ] 4.1 Create `src/tui/app/useHomeNavigation.ts` — `useState` wrapping pure navigation; returns `{ view, cursor, items, actions }`
- [ ] 4.2 Create `src/tui/app/App.tsx` — discriminated-union state machine (`list | submenu`); `useInput` handler; renders `HomePage`; accepts `dispatch` + `hasActiveRemote` props
- [ ] 4.3 RED: Write `src/tui/app/App.test.tsx` — ink-testing-library: move→select→submenu→back flow, disabled rendering, doctor dispatch spy
- [ ] 4.4 GREEN: Wire `src/index.ts` → `<App dispatch={defaultDispatch} hasActiveRemote={false} />`

## Phase 5: Lint Enforcement

- [ ] 5.1 Run `bun run lint` — verify `import-x/no-restricted-paths` catches any `tui→cli` or `cli→tui` violations
