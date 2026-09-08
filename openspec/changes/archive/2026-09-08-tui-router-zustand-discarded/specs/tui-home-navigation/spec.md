# tui-home-navigation Specification

## Purpose

Home-screen menu cursor and selection behavior, now driven by the `tui-router`
Zustand store. This supersedes the former ad-hoc `ViewState` union (`list` |
single-level `submenu` with `restoreCursor`) and the `enterSubmenu`/`exitSubmenu`
helpers that operated against local `useState`. Selection now dispatches through the
router, and back navigation pops the shared history stack instead of always
returning to a flat list.

> **Baseline note:** No prior formal spec existed for this capability. This spec
> captures the post-change behavior; the transition is documented in the proposal's
> Modified Capabilities section.

## Requirements

### Requirement: Cursor Movement

The cursor moves up/down through the selectable items on the `home` route, wrapping
at boundaries. Selectable items are pre-filtered by their `enabledWhen` condition.
This behavior is unchanged from the prior implementation but is now scoped to the
`home` route only.

#### Scenario: Wrap down at the boundary

- GIVEN the cursor is on the last selectable item on `home`
- WHEN a down key (`j` / down arrow) is pressed
- THEN the cursor wraps to index 0

#### Scenario: Wrap up at the boundary

- GIVEN the cursor is on the first selectable item on `home`
- WHEN an up key (`k` / up arrow) is pressed
- THEN the cursor wraps to the last selectable item

### Requirement: Selection Dispatches via Router

Selecting an `action` item MUST invoke its dispatch handler. Selecting a `submenu`
item MUST call the router's `navigate()` to the submenu route rather than perform a
local `useState` transition. The home cursor MUST reset to 0 on the new route.

#### Scenario: Action item runs its handler

- GIVEN focus is on the `doctor` item (kind `action`) on `home`
- WHEN Enter (`return` / `l`) is pressed
- THEN the `doctor` dispatch handler runs

#### Scenario: Submenu item navigates via router

- GIVEN focus is on the `remotes` item (kind `submenu`) on `home`
- WHEN Enter is pressed
- THEN `navigate()` is called to the remotes submenu route
- AND `currentRoute` leaves `home`
- AND the home cursor resets to 0

### Requirement: Back via Router goBack

The back keys (`Esc` / `backspace` / `h`) MUST call the router `goBack()`. When
`history` is non-empty, the previous route is restored. When `history` is empty on
`home`, `goBack()` exits the TUI. The former single-level "always return to the flat
list, restoring `restoreCursor`" semantics are removed.

#### Scenario: Back pops the history stack

- GIVEN `currentRoute` is `doctor` and `history` contains `home`
- WHEN `Esc` is pressed
- THEN `goBack()` is invoked
- AND `currentRoute` becomes `home`

#### Scenario: Back on home with empty history exits

- GIVEN `currentRoute` is `home` and `history` is empty
- WHEN `Esc` is pressed
- THEN `goBack()` exits the TUI

## Out of Scope

- Route registry contents and per-route `showLogo` policy (see `tui-router`).
- Sub-action behavior within the remotes submenu (ships per command use case).
- Cursor carry-over across routes — superseded by the always-reset-to-0 decision.
