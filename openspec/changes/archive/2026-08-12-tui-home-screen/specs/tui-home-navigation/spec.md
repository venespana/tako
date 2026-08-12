# tui-home-navigation Specification

## Purpose

Render the bare `tako` home screen, move a cursor across three action groups and a
`remotes` submenu by keyboard, and dispatch selections to domain use cases. Navigation +
dispatch only — no command behavior beyond `doctor`.

## Requirements

### Requirement: Home Screen Composition

The home screen MUST render, in fixed order: centered ASCII logo, three labeled groups
(Local, Remote, Config), version footer, key-hint bar.

#### Scenario: All regions present

- GIVEN `tako` is launched with no arguments
- WHEN the home screen renders
- THEN logo, three groups, version footer, and key-hint bar are all visible

### Requirement: Menu Content and Hidden Actions

Each item MUST belong to one group and reference a command in the closed 9-command
contract (`docs/commands.md`); no other command MAY appear. An action command MUST appear
iff its use case is implemented — unimplemented ones are excluded entirely, never greyed.
`remotes` is a navigation entry, always shown.

#### Scenario: Unimplemented commands hidden

- GIVEN `install`, `update`, `status`, `logs`, `cleanup`, `rollback` lack a use case
- WHEN the home screen renders
- THEN none of them appear as items
- AND `doctor` (implemented) appears under Local

#### Scenario: remotes always shown

- GIVEN `remotes` opens a submenu
- WHEN the home screen renders
- THEN a `remotes` entry is visible under the Remote group regardless of use-case status

### Requirement: Cursor Rendering

The focused item MUST be prefixed with a `❯` glyph in cyan; others MUST NOT show it. No
per-group color.

#### Scenario: Cursor on focused item only

- GIVEN the cursor is on `doctor`
- WHEN the screen renders
- THEN `❯` in cyan precedes `doctor` and no other item shows `❯`

### Requirement: Keyboard Navigation

`↑`/`↓` and `j`/`k` MUST move; `Enter`/`l` MUST select; `h`/`Esc` MUST go back; `q`/`Ctrl-C`
MUST quit. Movement MUST wrap at boundaries and skip disabled items.

#### Scenario: Move and wrap

- GIVEN the cursor is on the last selectable item
- WHEN the user presses `↓`
- THEN the cursor moves to the first selectable item

#### Scenario: Skip disabled item

- GIVEN a Remote-group item is disabled
- WHEN the user navigates past its position
- THEN the cursor skips it without landing on it

### Requirement: Submenu Navigation

Selecting `remotes` MUST open a submenu listing its subactions (`add`, `list`, `rm`,
`use`, `test`). `h`/`Esc` MUST return to the home list with the cursor on `remotes`.
Subaction dispatch is out of scope.

#### Scenario: Open and close remotes submenu

- GIVEN the cursor is on `remotes`
- WHEN the user presses `Enter`
- THEN the submenu showing `add`, `list`, `rm`, `use`, `test` appears
- WHEN the user then presses `Esc`
- THEN the home list is restored with the cursor on `remotes`

### Requirement: Disabled State When No Remote

Remote-group items (except `remotes`) MUST render greyed and non-selectable when no remote
is configured, and normal/selectable otherwise.

#### Scenario: Disabled with no remote

- GIVEN `hasActiveRemote` is false
- WHEN the Remote group renders
- THEN its action items appear greyed and are not selectable

### Requirement: Action Dispatch

Selecting an implemented action MUST invoke a handler that calls the matching domain
application use case via a declared port. Handlers MUST NOT import `cli/*`. `doctor`
MUST invoke the existing `system` use case.

#### Scenario: doctor dispatch

- GIVEN the cursor is on `doctor`
- WHEN the user presses `Enter`
- THEN the `system` host-dependency use case is invoked

#### Scenario: No tui-to-cli imports

- GIVEN the TUI dispatch layer is implemented
- WHEN source dependencies are analyzed
- THEN no module under `src/tui/` imports from `src/cli/`

### Requirement: Version Footer

The footer MUST show the package version from a build-time codegen constant in
`src/shared/lib/version.ts`. The TUI MUST NOT read `package.json` at runtime.

#### Scenario: Build-time version

- GIVEN the binary is built with version `1.2.3`
- WHEN the home screen renders
- THEN the footer shows `1.2.3` with no runtime `package.json` import

### Requirement: Key Hints Bar

The key-hint bar MUST list the active keys for the current view and SHALL update on view
change.

#### Scenario: Hints reflect view

- GIVEN the user opens the `remotes` submenu
- WHEN the bar renders
- THEN it indicates a back/return key in addition to movement, select, and quit keys

## Out of Scope

- install/update/status/logs/cleanup/rollback and remotes-subaction use cases; `remotes add` wizard; secure credential storage; SSH layer; docker remote adapter; theming beyond cursor color and disabled style.
