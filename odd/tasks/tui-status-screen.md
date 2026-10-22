# TUI — Status screen with real data

## Objective

Wire the `/status` route (today `<Text>status</Text>` stub) to the shipped
`getStackStatus()` service — the same one the CLI uses — rendering the four
pen-designed states (loading / dashboard / empty / error) against the active
remote, with `r` refresh/retry.

## Problem & why

`tako status` shipped in the CLI (mvp-status-command S1–S8: strict
`docker compose ls` parser over SSH, typed refusals, session-password
resolution) while the TUI StatusPage is a stub. The pen refresh designed the
four status screens (T7–T10). This feature connects them to the real service.

## Scope

- `src/tui/pages/status/` (FSD slice): model (pure status classifier +
  stats), `use-status` hook (state machine loading → ok | empty | error,
  strict refusal — never partial data), four `ui/` components (one per file,
  `react/no-multi-comp`), page composition, barrel.
- Route shim `src/tui/app/routes/status.tsx`: injects active remote +
  session password from the app runtime store; without an active remote it
  redirects home (status is a remote-context screen).
- Home menu registry: gated `Status` item (`hasActiveRemote`) in the Remote
  group navigating to `/status` — the only reachable path until the hub's
  Global actions tab exists (noted deviation from the pen home mock).

Out of scope: hub Global actions tab, hub container inventory, stack
actions, agent-protocol changes.

## Constraints

- Strict-refusal convention: corrupt/partial remote output renders the error
  state with the refusal reason — never a partial table.
- Service: `getStackStatus({ remote, sessionPassword })` from
  `services/docker` (tui → services import is legal; pages never import
  `app/` — the shim is the composition point).
- Status classification for color: contains `exited` → error; contains
  `paused` → warning; otherwise success (matches pen rows: running(3) green,
  exited(1) red, paused yellow).
- Keys: `r` refresh (dashboard/empty) / retry (error); ↑↓ browse stacks
  (dashboard only). Hints via `usePageHints`; route stays a command page
  (`menu: false` default footer back/quit, plus the published hints).
- One component per file (S6 rule); Ink inline colors; English comments.

## Checklist

- [x] S1 — Model: `classifyStackStatus`, `computeStatusStats`, and the
      `use-status` hook (fetch + refresh + state machine) with TDD.
- [x] S2 — UI: `StatusDashboard`, `StatusLoading`, `StatusEmpty`,
      `StatusError`, `StatusPage` composition + render tests per state.
- [x] S3 — Route shim wiring (runtime store → props, no-remote redirect) +
      registry `Status` item (gated) + tests.
- [x] S4 — Full checks: focused tests, full suite, typecheck, scoped lint
      (incl. `no-multi-comp` = 0).

## Route declaration

Delegated direct — one writer (general agent). Trigger: 2+ non-trivial
files (model + hook + 5 UI files + shim + registry + tests). Parent owns
this doc; writer owns the listed source files only.

## Delivery

Forecast ≈ 600–700 authored lines → over the ~400 slice advisory. Strategy
ask-on-risk: propose two work-unit commits at delivery — (1) the status
screen (model + ui + tests), (2) wiring (shim + registry). No version bump
(direct branch commits, no PR yet).

## Acceptance criteria

- With an active remote, `/status` shows the real stacks table (loading →
  dashboard/empty/error), `r` refreshes, ↑↓ browses, detail column tracks
  selection; refusals render the error state verbatim.
- Without an active remote, `/status` redirects home.
- Full suite, typecheck, scoped lint pass; `no-multi-comp` = 0.

## Progress

- 2026-10-21: feature doc created after service + pen + registry
  exploration; branch `feature/tui-status-screen` cut from `main`. S1–S4
  pending.
- 2026-10-21: S1–S4 completed via one delegated writer (RED→GREEN twice:
  model/hook 18 tests, then UI 10). Parent applied the required
  `menu-registry.test.ts` update (the new gated `status` item invalidated
  two assertions — tests travel with the behavior change) as an inline
  correction. Known deviations: Spinner uses the `label` prop (component
  API), health colors asserted in pure-model tests (ink-testing-library
  strips ANSI), `unknown-remote` and `refusal` both land in the error
  state with the verbatim reason.

## Verification evidence

- `bun run test -- src/tui/pages/status src/tui/features/menu`: 7 files /
  58 tests passing (parent spot check after the registry test fix).
- `bun run test` (full): 98 files / 866 tests passing.
- `bun run typecheck`: exit 0.
- Scoped eslint over pages/status + routes/status.tsx + registry files:
  exit 0 (`no-multi-comp` = 0). Note: `features/menu` model files carry
  12 pre-existing lint findings on clean HEAD (padding-line + 2 for-of
  loops) — part of the recorded repo-wide lint debt, not touched.
- 2026-10-21 (post-merge hardening): the writer of the hub's live
  inventory flagged a refresh race in `use-status.test.ts` (resolve before
  the effect dispatches the second fetch). Parent fixed inline —
  `vi.waitFor` on the fetch call count; 3 focused runs + full suite
  (104 files / 920 tests) green.
