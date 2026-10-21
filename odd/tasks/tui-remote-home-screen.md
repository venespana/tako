# TUI — Screen Home/Remote (visible skeleton)

## Objective

Implement the `Screen - Home / Remote` design (pen `Ftex5`, Servicios tab) as a
visible TUI page: route `/remote-home`, static inventory fixture, container
actions panel. Scope of this iteration is visibility only — reach the screen
through the real activation flow; interactive behavior (tab switching,
container selection, real docker data) comes later.

## Problem & why

The pen-refresh feature (tui-screens-pen-refresh, closed) designed the full
14-screen flow. Flow map: Home (no remote) → Select → Connect gate →
Home/Remote[1] Servicios. Today, activating a remote still lands on the
interim `/tasks` workspace (9.14b stopgap), and no remote hub screen exists.
This feature replaces that landing with the designed hub skeleton.

## Scope

- New page `remote-home` (FSD: `src/tui/pages/remote-home/`) rendering the
  design skeleton: tab bar (1 Servicios active / 2 Global actions muted),
  services inventory (collapsible compose-project groups + Others, status
  lights, cursor on focused row), bordered actions panel (View logs l /
  Restart r / Stop s / Inspect i, contextual note, hint). Static fixture
  data mirroring the design mock (media expanded: immich/jellyfin/plex;
  proxy, monitoring, homeassistant, backup, downloads collapsed; Others:
  portainer/watchtower "no compose").
- Route shim `/remote-home` with `menu: true` handle (design footer shows
  menu hints) + regenerated `routes.generated.ts`.
- Activation flow: `activateAndEnterTasks` → renamed
  `activateAndEnterRemoteHome`, navigating to `/remote-home`.

Out of scope (later iterations): tab 1/2 switching (Global actions sister
screen `s8rUlb`), keyboard movement/selection, real container data,
View logs → Logs navigation.

## Constraints

- Labels verbatim from the approved design: `Servicios`, `Global actions`.
- Colors follow existing page conventions (inline Ink `green`/`red`/`yellow`,
  `dimColor` for muted); cursor glyph/color from `shared/ui/theme.ts`.
- Header (logo + active remote line) and footer (hints + version) are
  AppShell chrome — the page renders body content only, like other pages.
- English for all code/comments; UI copy only where the design dictates.
- No commits without explicit user confirmation (repo rule).

## Checklist

- [x] S1 — Inventory model: typed container/group/status shapes + static
      fixture in `src/tui/pages/remote-home/model/`.
- [x] S2 — `RemoteHomePage` UI skeleton + render test
      (`src/tui/pages/remote-home/ui/RemoteHomePage.tsx` + `.test.tsx`,
      barrel `index.ts`).
- [x] S3 — Route shim `src/tui/app/routes/remote-home.tsx` (menu handle) +
      `bun run generate:routes`.
- [x] S4 — Activation enters `/remote-home`: rename + retarget
      `activate-and-enter.ts`, update its test (RED first), update the
      `/remotes` shim comment.
- [x] S5 — Full checks: `bun run test && bun run typecheck && bun run lint`.
- [x] S6 — One-component-per-file lint rule (user request 2026-10-21):
      `react/no-multi-comp: 'error'` (+ eslint-plugin-react devDep, plugin
      registered for the pre-existing `react/*` entries) with a last-wins
      test-file override; the 4 violating production files split into
      same-slice modules.

## Route declaration

Delegated direct — one writer (general agent). Trigger evidence: 2+
non-trivial files (model + page + test + shim + activation rewiring + tests).
Parent owns the feature doc; writer owns the listed source files only.

## Delivery

Forecast ≈ 250–350 authored lines (single work unit, under the ~400 budget).
Strategy: ask-on-risk → single PR unnecessary so far; direct commits on
`feature/tui-remote-home-screen` pending user confirmation (version bump only
applies to PRs per ADR-0017 workflow note).

## Acceptance criteria

- Selecting a remote in the TUI (non-interactive and post-gate) lands on
  `/remote-home` and the skeleton renders like the design mock.
- `bun run test`, `bun run typecheck`, `bun run lint` pass.
- No change to /tasks route itself; tasks remains reachable (untouched for
  now).

## Technical debt (deferred 2026-10-21, user decision)

- steiger `fsd/insignificant-slice` ×2: `features/doctor` (solo lo usa
  pages/doctor) y `entities/job` (solo lo usa pages/tasks). Dirección
  acordada: merge al consumidor cuando se ataque; re-extraer si aparece un
  segundo consumidor. `bun run steiger` sale 1 hasta entonces.
- Lint repo-wide preexistente rojo (~700: `padding-line-between-statements`
  y for-loops sobre scripts/ y archivos src antiguos). lint-staged
  auto-arregla lo stageado al commitear.

## Decisions

- 2026-10-21: `app/providers` se mantiene con ese nombre (decisión del
  usuario tras probar el rename a `runtime`): FSD lista providers como
  preocupación de primera clase de la capa app y es el estado global de la
  app. Excepción intencional documentada en `steiger.config.js`
  (`fsd/segments-by-purpose: off` scoped a `src/tui/app/providers/**`).

## Progress

- 2026-10-20: feature doc created after pen + repo exploration; branch
  `feature/tui-remote-home-screen` created from `main`. S1–S5 pending.
- 2026-10-20: S1–S5 completed via one delegated writer (general agent).
  Writer observed RED (missing module + missing export) then GREEN
  (11/11 focused). Parent correction: Others bucket carries uptime-kuma as
  its third standalone container so the COMPUTED totals match the design
  meta and the Screen - Status canonical counts (14 containers · 12
  running) — the pen frame only drew two Others rows (13/11 errata).
  Route declaration held: implementation was delegated (2+ non-trivial
  files); parent correction inline (1 fixture file + its test).
- 2026-10-21: S6 added and completed (user request). Rule
  `react/no-multi-comp: 'error'` + eslint-plugin-react devDep; the block
  also registers the plugin, activating the previously dead `react/*`
  entries (all explicitly off). Test override lives in its own block AFTER
  the React block (flat config last-wins — placing it in the earlier test
  block was shadowed). Violations found in 4 files: RemoteHomePage (3),
  DoctorScreen (2), AddRemoteWizard + JobForm (1 each); writer split all
  into same-slice `ui/` modules (pure moves, tests untouched, no barrels).
  Repo-wide lint baseline is pre-existing red (~700: padding-line +
  for-loop rules over scripts/ and older src files) — out of scope here;
  lint-staged auto-fixes staged files at commit time.

## Verification evidence

- `bun run test -- src/tui/pages/remote-home
  src/tui/app/routes/remotes/activate-and-enter.test.ts`: 2 files /
  11 tests passing (parent spot-check re-run after the fixture correction).
- `bun run test` (full): 96 files / 847 tests passing.
- `bun run typecheck`: clean (`tsc --noEmit`, exit 0).
- `bun run lint` scoped to the touched paths: exit 0 (repo-wide lint has
  777 pre-existing errors from older files — outside this scope).
- `bun run generate:routes`: 15 routes from 14 route files, `remote-home`
  present in `routes.generated.ts`.
- Diff: 4 tracked files changed (25+/18−) + 5 new source/test files
  (~475 authored lines, above the ~400 slice advisory — kept as one work
  unit: a split skeleton would not review better; noted for the chained-PR
  strategy if this grows).
- 2026-10-21 (S6): `no-multi-comp` count over src/ = 0 (writer ran it,
  parent spot check re-ran it). `bun run typecheck` exit 0 (spot check).
  Full suite 847 passing post-split; scoped eslint on touched dirs exit 1
  ONLY from the pre-existing padding-line/for-loop baseline (0 findings
  attributable to the splits).
- 2026-10-21 (commits 3fc9693 + 47862bd): RDD assess → medium,
  review_due (slice_budget_reached, 877 lines). Consent GRANTED by user;
  lineage review-f1c382fe17abedfd froze (24 paths) but the reliability
  lens slot was refused twice by the transport relay (output_refused —
  same signature as 2026-10-16) → capture-unachievable recorded → STATUS
  stop `unachievable_lens_slot`. User decisions: do NOT report to
  gentle-ai; RDD stays ON for this clone (each future medium/high
  candidate will consent → stop until the transport is fixed). Review
  boundary does NOT advance: next assess keeps --base-ref main. Delivered
  under ordinary repository policy; push/PR pending user decision.
