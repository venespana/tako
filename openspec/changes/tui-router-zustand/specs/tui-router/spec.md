# tui-router Specification

## Purpose

A Zustand-backed router for the TUI. It owns `currentRoute`, `params`, and a bounded
`history` stack, exposing `navigate(route, params)` and `goBack()`. A declarative
route registry maps each route to a screen component and a `showLogo` flag. This
replaces the former ad-hoc `useState` view state so any screen can navigate to any
other and `goBack` returns to the _previous_ screen.

## Requirements

### Requirement: Route Model

The system MUST model TUI navigation as `{ currentRoute, params }`. The canonical
route set SHALL be exactly: `home`, `remotes.add`, `remotes.list`, `remotes.rm`,
`remotes.use`, `remotes.test`, `doctor`, `logs`, `status`, `cleanup`. No other routes
MAY exist in this iteration.

#### Scenario: Initial route

- GIVEN the TUI starts
- WHEN the router store initializes
- THEN `currentRoute` is `home`
- AND `history` is empty

#### Scenario: Params are route-scoped

- GIVEN a navigation to `remotes.add` with `{ host: 'foo' }`
- WHEN the store updates
- THEN `params` equals `{ host: 'foo' }` for the current route

### Requirement: Bounded History Stack

`navigate(route, params)` MUST push the prior `{ route, params }` onto `history`
before switching `currentRoute`. The history stack MUST be capped at 20 entries; when
a new entry would exceed the cap, the oldest entry SHALL be dropped.

#### Scenario: Push prior route onto history

- GIVEN `currentRoute` is `home`
- WHEN `navigate('doctor')` is called
- THEN `history` contains `{ route: 'home' }`
- AND `currentRoute` is `doctor`

#### Scenario: History cap at 20

- GIVEN `history` already holds 20 entries
- WHEN `navigate('logs')` is called
- THEN `history` still holds exactly 20 entries
- AND the oldest prior entry has been dropped

### Requirement: Same-Route Deduplication

When `navigate` targets the same route as the current `currentRoute`, the system
MUST NOT push a duplicate history entry. It SHALL update `params` in place; the
`history` length MUST remain unchanged.

#### Scenario: Re-navigate to the same route

- GIVEN `currentRoute` is `doctor` and `history` length is 3
- WHEN `navigate('doctor', { verbose: true })` is called
- THEN `params` becomes `{ verbose: true }`
- AND `history` length stays 3

### Requirement: Back Navigation

`goBack()` MUST pop the most recent entry from `history` and restore it as the
current route. When `history` is empty, `goBack()` MUST request TUI exit by invoking
the Ink `exit` primitive.

#### Scenario: Pop to previous route

- GIVEN `history` is `[{ route: 'home' }]` and `currentRoute` is `doctor`
- WHEN `goBack()` is called
- THEN `currentRoute` becomes `home`
- AND `history` is empty

#### Scenario: Empty history exits the TUI

- GIVEN `history` is empty and `currentRoute` is `home`
- WHEN `goBack()` is called
- THEN the TUI exits

### Requirement: Cursor Reset on Route Entry

On every route entry — whether via `navigate` or `goBack` — the home menu cursor
index MUST reset to 0.

#### Scenario: Cursor resets after a round trip

- GIVEN the cursor is 5 on `home`
- WHEN `navigate('doctor')` runs followed by `goBack()`
- THEN the cursor is 0 upon returning to `home`

### Requirement: Declarative Route Registry

The system MUST expose a registry mapping each route to its screen component and a
`showLogo` boolean. `App.tsx` SHALL render the screen mapped to `currentRoute` and
SHALL render `<Logo/>` only when the mapped `showLogo` flag is true.

#### Scenario: Render the mapped screen

- GIVEN `currentRoute` is `logs`
- WHEN `App` renders
- THEN the `logs` screen component is rendered

#### Scenario: Logo hidden on detail routes

- GIVEN `currentRoute` is `doctor` and its `showLogo` is false
- WHEN `App` renders
- THEN `<Logo/>` is NOT rendered

#### Scenario: Logo shown on home and submenu routes

- GIVEN `currentRoute` is `home` and its `showLogo` is true
- WHEN `App` renders
- THEN `<Logo/>` IS rendered

### Requirement: Zustand Single Store

All router state (`currentRoute`, `params`, `history`) MUST live in a single Zustand
store. React components SHALL read it via selectors; no `useState` MAY hold route or
view state.

#### Scenario: No useState for route state

- GIVEN the TUI source after this change
- WHEN source dependencies are analyzed
- THEN no `useState` call holds `currentRoute` or `view`

### Requirement: CLI Isolation

The router store MUST NOT be imported by `src/cli/`. The CLI outputs directly and is
router-free.

#### Scenario: CLI has zero router imports

- GIVEN the built CLI source tree
- WHEN `src/cli/**` imports are analyzed
- THEN there are zero imports of the router store

## Out of Scope

- Real command-screen behavior for each route (ships per command use case).
- `install`/`update`/`rollback` routes (hidden until their use cases exist).
- Persistence of the history stack across TUI sessions.
- Param validation/schema per route beyond the opaque `params` object.
