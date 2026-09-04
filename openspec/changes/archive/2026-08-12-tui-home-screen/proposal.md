# Proposal: tako TUI home screen (interactive shell)

## Intent

`tako` with no args is the canonical entry (`docs/commands.md`), yet `src/tui/` is empty (`.gitkeep` only). Users cannot interactively discover or invoke the 9-command surface. This change ships the **navigation shell**: centered ASCII logo, three action groups (Local / Remote / Config), movable cursor (❯ cyan), vim + arrow navigation, a `remotes` submenu, key hints, and the package version. It dispatches to domain use cases where they exist (`doctor`); commands without an implemented use case are **hidden** from the menu until their use case lands — this keeps the UX clean and prevents confusion from ghost entries.

## Scope

### In Scope

- `src/tui/` FSD scaffolding: `app/`, `pages/`, `widgets/`, `features/`, `entities/`, `shared/`.
- Home render: ASCII logo (centered), 3 grouped menus, version footer, key-hint bar.
- Navigation state machine: list → submenu (`remotes`) → back.
- Keys: `↑↓`/`j`/`k` move, `Enter`/`l` select, `Esc`/`h` back, `q`/`Ctrl-C` quit.
- Declarative action registry mapping the 9 commands to groups + handlers.
- `doctor` wired to existing `system` use case; commands without a domain use case are **hidden** from the menu.
- Items in Remote group are **disabled** (grised) when no remote is configured.
- Version via build-time codegen constant (hardcoded, avoids runtime JSON import).
- Unit tests via `ink-testing-library`; strict TDD.

### Out of Scope

- Real implementation of `install`/`update`/`status`/`logs`/`cleanup`/`rollback` use cases (separate changes each).
- `remotes add` wizard; secure credential storage.
- SSH layer, docker remote adapter.
- Theming beyond minimum tokens for cursor + groups.

## Capabilities

> Contract for sdd-spec. No TUI spec exists yet.

### New Capabilities

- `tui-home-navigation`: render the home screen, navigate groups/items/submenus via keyboard, and dispatch selections to action handlers.

### Modified Capabilities

- None (TUI layer has no specs yet; `host-dependency-check` untouched).

## Approach

FSD layout under `src/tui/`. `app/App.tsx` owns the view-state machine (list | submenu) and renders `widgets/Logo`, `ActionMenu`, `KeyHints`, `VersionBar`. A `features/menu` action registry (pure data) declares the 3 groups + items, marking which opens a submenu (`remotes`) vs. dispatches. `useInput` (Ink) drives the state machine. Handlers call domain use cases via application ports — never `cli/*`. `doctor` invokes `CheckHostDependencies`; unimplemented commands are excluded from the registry entirely (hidden from UI). Remote-group items check `hasActiveRemote` config before enabling; if false they render grayed/disabled. Version is a `VERSION` constant exported from `src/shared/lib/version.ts` and populated at build time via a build script.

## Affected Areas

| Area                                                    | Impact   | Description                      |
| ------------------------------------------------------- | -------- | -------------------------------- |
| `src/tui/{app,pages,widgets,features,entities,shared}/` | New      | FSD TUI shell                    |
| `src/cli/index.ts`                                      | Modified | route bare `tako` to the Ink TUI |
| `src/shared/lib/`, `src/shared/types/`                  | Modified | version constant, registry types |

## Risks

| Risk                                                         | Likelihood | Mitigation                                                                            |
| ------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------- |
| Scope exceeds "one command" rule                             | Med        | Ship shell + dispatch only; each command's behavior is a separate change              |
| Ink `useInput` keymap collisions (Esc vs. raw mode)          | Low        | Cover key handling with `ink-testing-library` unit tests                              |
| Version drift between `package.json` and build-time constant | Low        | Build script syncs version from package.json during build                             |
| Hidden unimplemented actions feel like missing features      | Low        | Clear documentation that shell ships incrementally; each command is a separate change |

## Rollback Plan

All changes are additive (new `src/tui/` tree + one routing line in `src/cli/index.ts`). Revert by deleting `src/tui/` contents (back to `.gitkeep`) and restoring `src/cli/index.ts` to commander-only routing. No host state, compose files, or templates touched.

## Dependencies

- `ink@7`, `react@19` (present). No new dependencies.

## Success Criteria

- [ ] `tako` (no args) renders logo + 3 groups + version + key hints.
- [ ] `↑↓`/`j`/`k` move the cursor (❯ cyan); `Enter`/`l` selects; `Esc`/`h` returns from submenu; `q` quits.
- [ ] Selecting `remotes` opens its submenu (`add`/`list`/`rm`/`use`/`test`); selecting `doctor` runs the existing use case.
- [ ] Remote-group items are disabled when no remote is configured.
- [ ] Only commands with implemented domain use cases appear in the menu.
- [ ] `bun run test`, `typecheck`, `lint`, `build` clean; no tui↔cli imports.
