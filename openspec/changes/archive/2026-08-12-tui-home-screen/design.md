# Design: tako TUI home screen (interactive shell)

## Technical Approach

New FSD TUI tree under `src/tui/` rendered by Ink. A composition root (`src/index.ts`) replaces `src/cli/index.ts` as the bin target: bare `tako` launches the TUI, any subcommand delegates to commander. This root sits above both `cli/` and `tui/`, respecting the forbidden `cli↔tui` import rule. `App.tsx` owns a discriminated-union view-state machine (`list | submenu`) driven by Ink's `useInput`. A declarative action registry (pure data in `features/menu/`) lists only implemented commands (`doctor` + the `remotes` navigation entry). Pure navigation functions handle cursor wrap and disabled-skip. Handlers dispatch to domain use cases via injected ports — never `cli/*`. Version is a build-time codegen constant.

## Architecture Decisions

| Decision                 | Choice                                                                                                                          | Rejected                                       | Rationale                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Composition root         | New `src/index.ts` above both `cli/` and `tui/`; bin path updated                                                               | Have `cli/index.ts` import `tui/`              | Architecture.md forbids `cli→tui`. A root file at `src/` is neither layer; it is the only file allowed to import both.                        |
| State machine            | Discriminated union `{ view: 'list' } \| { view: 'submenu'; parentId }` in a custom hook                                        | Single boolean `inSubmenu`                     | Discriminated union is exhaustive; TypeScript enforces all branches. Cursor-restore target stored on submenu entry.                           |
| Navigation logic         | Pure functions in `navigation.ts` (not hooks)                                                                                   | Logic inside hook                              | Pure functions are testable without `renderHook` or ink-testing-library; hook is a thin `useState` wrapper.                                   |
| Action registry          | Declarative data: `ActionGroup[]` with `ActionItem { kind: 'action'\|'submenu', enabledWhen, handlerKey }`                      | Imperative component tree                      | Data-driven menu; hidden commands are simply absent from the array. Adding a command = adding one object.                                     |
| Disabled items           | Filtered out of selectable list by `enabledWhen` predicate; rendered greyed but not cursor-reachable                            | Greyed + cursor-reachable with Enter blocked   | Spec says "skip disabled" on navigation — filtering the selectable array gives correct wrap + skip for free.                                  |
| Colors                   | Ink `<Text color>` / `<Text dimColor>`                                                                                          | `picocolors` in TUI                            | Ink renders colors natively in its managed output; picocolors is for non-Ink stdout only (per stack.md).                                      |
| Version codegen          | `scripts/generate-version.ts` writes `src/shared/lib/version.ts` from `package.json`; runs in `prebuild` step of `build` script | Runtime `import pkg from '../../package.json'` | Spec forbids runtime package.json read. Checked-in default (`0.0.0`) keeps repo green between builds.                                         |
| Dispatch DI              | `App` accepts `dispatch: Record<actionId, () => Promise<void>>` prop; default map wires real use cases; tests inject spies      | Direct use-case calls in components            | Mirrors existing ctor-injection pattern (`CheckHostDependencies(checker)`). Testable via ink-testing-library without spawning real processes. |
| `hasActiveRemote` source | Prop on `App` (boolean, default `false`); no config domain exists yet                                                           | Read `conf` store in TUI                       | No remotes domain landed. Prop injection keeps TUI decoupled and testable; wiring moves to composition root when the domain arrives.          |

## Data Flow

```
argv[]
  │
  ▼
src/index.ts ──(no args)──► render(<App dispatch hasActiveRemote />)
  │                                    │
  │(args)                              ├─ useHomeNavigation(registry, hasActiveRemote)
  ▼                                    │    → { view, cursor, items, actions }
src/cli/index.ts                       ├─ useInput → moveCursor / select / back / quit
  │                                    ▼
  ▼                               pages/HomePage
commander                           ├─ widgets/Logo (ASCII, centered)
  └─ doctor ──► CheckHostDependencies  ├─ widgets/ActionMenu (groups + ❯ cursor)
                                       ├─ widgets/KeyHints (view-aware)
                                       └─ widgets/VersionBar (VERSION const)

select(doctor) ──► dispatch.doctor() ──► CheckHostDependencies(LocalHostToolChecker)
```

## File Changes

| File                                      | Action | Description                                                                                        |
| ----------------------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| `src/index.ts`                            | Create | Composition root: argv check → TUI or commander                                                    |
| `src/cli/index.ts`                        | Modify | Export `runCli()` instead of module-level `parse()`; remove root shebang (moves to `src/index.ts`) |
| `package.json`                            | Modify | `bin` → `src/index.ts`; `build` prepends `bun scripts/generate-version.ts`                         |
| `src/shared/lib/version.ts`               | Create | `export const VERSION = '0.0.0'` (codegen-overwritten)                                             |
| `src/tui/app/App.tsx`                     | Create | Root: state machine + `useInput` + renders HomePage                                                |
| `src/tui/app/useHomeNavigation.ts`        | Create | Hook: `useState` wrapping pure navigation functions                                                |
| `src/tui/pages/HomePage.tsx`              | Create | Visual composition: Logo + ActionMenu + KeyHints + VersionBar                                      |
| `src/tui/widgets/Logo.tsx`                | Create | Centered ASCII logo                                                                                |
| `src/tui/widgets/ActionMenu.tsx`          | Create | Renders groups/items; `❯` cyan on focused; greyed disabled                                         |
| `src/tui/widgets/KeyHints.tsx`            | Create | View-aware key-hint bar                                                                            |
| `src/tui/widgets/VersionBar.tsx`          | Create | Footer showing `VERSION`                                                                           |
| `src/tui/features/menu/types.ts`          | Create | `ActionGroup`, `ActionItem`, `ViewState`, `DispatchMap`                                            |
| `src/tui/features/menu/registry.ts`       | Create | Declarative groups: Local(doctor), Remote(remotes), Config()                                       |
| `src/tui/features/menu/navigation.ts`     | Create | Pure: `getSelectable`, `moveCursor(wrap+skip)`, `enterSubmenu`, `exitSubmenu`                      |
| `src/tui/features/menu/dispatch/index.ts` | Create | Default dispatch map; `doctor` wires `CheckHostDependencies`                                       |
| `src/tui/shared/theme.ts`                 | Create | Tokens: cursor glyph/color, disabled style                                                         |
| `scripts/generate-version.ts`             | Create | Reads `package.json` → writes `version.ts` (Node `fs`, not Bun-only)                               |
| `eslint.config.js`                        | Modify | Add `import-x/no-restricted-paths`: forbid `tui→cli` and `cli→tui`                                 |

## Interfaces / Contracts

```typescript
// features/menu/types.ts
type ViewState =
  | { view: 'list' }
  | { view: 'submenu'; parentId: string; restoreCursor: number };

interface ActionItem {
  id: string; label: string; command: string;
  kind: 'action' | 'submenu';
  submenu?: string[];                 // subaction labels
  enabledWhen?: 'always' | 'hasActiveRemote';
  handlerKey?: string;               // resolved via DispatchMap
}
interface ActionGroup { id: string; label: string; items: ActionItem[]; }
type DispatchMap = Record<string, () => Promise<void>>;

// features/menu/navigation.ts (pure)
function getSelectable(registry, view, hasActiveRemote): ActionItem[];
function moveCursor(selectable: ActionItem[], cursor: number, dir: +1|-1): number;
```

## Testing Strategy

| Layer         | What                                                                                   | Approach                                                                            |
| ------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Unit (pure)   | Navigation: wrap, skip-disabled, submenu open/close, cursor restore                    | Direct function calls in `navigation.test.ts` — no React                            |
| Unit (pure)   | Registry: only `doctor` + `remotes` present; correct groups                            | Assert array contents                                                               |
| Unit (widget) | Logo, ActionMenu cursor glyph, KeyHints per view, VersionBar                           | `ink-testing-library` render + assert last frame                                    |
| Integration   | App: keypress flow (move→select→submenu→back), disabled rendering, doctor dispatch spy | `ink-testing-library`: `render(<App dispatch={spy}>)`, `instance.stdin.write('\r')` |
| Lint          | No `tui→cli` imports                                                                   | `eslint no-restricted-paths` rule (enforced by `bun run lint`)                      |

Strict TDD: RED tests written first for every unit and integration case above.

## Threat Matrix

N/A — no shell-command construction, no subprocess spawning (doctor reuses the existing audited `LocalHostToolChecker`), no VCS/PR automation, no executable-file classification, no external-input routing. The argv branch is a fixed `process.argv.length === 0` literal check, not dynamic dispatch.

## Migration / Rollout

No migration required. Changes are additive (new `src/tui/` tree + `src/index.ts`) plus two one-line edits (`package.json` bin, `cli/index.ts` export). Rollback: delete `src/tui/` contents, delete `src/index.ts`, restore `cli/index.ts` to module-level `program.parse()`, restore `package.json` bin to `src/cli/index.ts`.

## Open Questions

- [ ] Doctor result UX in TUI: print to stdout + exit, or render in-app then return to menu? MVP favours print + exit (simplest); in-app rendering is a separate change.
- [ ] `hasActiveRemote` wiring: prop injection now, but when the remotes domain lands, should App read a `RemoteConfigPort` or stay prop-driven from the composition root?
