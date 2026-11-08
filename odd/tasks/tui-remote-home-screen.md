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

## Iteration 2 — live container inventory (2026-10-21, user request)

The hub's Services tab shows the ACTIVE remote's real containers, replacing
the static fixture. Texts in ENGLISH (user decision — overrides the pen's
`Servicios` label; that was the only Spanish string).

- [x] S7 — Docker domain: strict `docker ps -a --format '{{json .}}'` parser
  (JSON-lines, refuse-on-corrupt mirroring parseComposeLsJson) +
  GetContainers use case + RemoteDockerPsAdapter over RemoteCommandRunner
  (port/adapter pattern of GetStackStatus/RemoteComposeCliAdapter).
- [x] S8 — Service: `getContainers({ remote, sessionPassword })` in
  `services/docker.ts` (refusal-object outcome, mirrors getStackStatus).
- [x] S9 — Hub rework: `use-remote-home` hook (loading/ok/empty/error) consuming
  the service; groups = compose project label (`com.docker.compose.project`),
  label-less containers → Others; status mapping running→running,
  paused→paused, everything else→exited; all groups expanded by default;
  meta `N containers · M running` computed live.
- [x] S10 — English labels: tab + section `Services`; full checks.
- [x] S11 — Collapsible groups (user request): SPACE toggles the focused
      group's expansion (Enter/l too on group rows); ↑↓ walks group and
      container rows; group-focused detail shows name + summary; hint
      `space collapse/expand` in the ok phase; pure row-builder + tests.

## Iteration 3 — container selection lock + start/restart (2026-10-26, user request)

Enter/→ on a focused CONTAINER row locks navigation into the right action
menu (up/down move the action cursor; ←/Esc returns to the list). The
selected container's name renders in the accent color (cyan) while locked.
The start/restart command ships: a stopped container STARTS, a running one
RESTARTS (`docker start` / `docker restart` over SSH, one command, key r).
Stop/Inspect stay visible but inert (later iterations).

- [x] S12 — Shared keys: `moveLeft`/`moveRight` bindings (ArrowLeft/Right)
      in `use-key-bindings.ts` + tests.
- [x] S13 — Docker domain: `ContainerLifecycleOp` ('start'|'restart'),
      container-name validation (`[a-zA-Z0-9][a-zA-Z0-9_.-]*`, refuses
      anything else — the shell surface stays closed),
      `RunContainerLifecycle` use case + `RemoteDockerLifecycleAdapter`
      (`docker start/restart <name>`) + tests (TDD).
- [x] S14 — Service: `runContainerLifecycle({ remote, sessionPassword,
      container, op })` in `services/docker.ts`, refusal-object outcome,
      same fresh-resolve + always-end discipline + tests.
- [x] S15 — Hub model: per-status action label (exited → 'Start', else
      'Restart') as a pure helper + tests.
- [x] S16 — Hub UI: `pane: 'list' | 'actions'` state; Enter/→ on a
      container locks (useMenuList deactivates), ←/Esc unlocks; ↑↓ walks
      the action menu; Enter runs the focused action (view-logs navigates,
      start/restart executes with in-panel running/error feedback and list
      refresh); selected container name in `theme.cursorColor`; hints
      reflect both panes; tests (TDD).
- [x] S17 — Full checks: `bun run test && bun run typecheck && bun run
      lint` (scoped), parent spot check.

### Correction round 1 (2026-10-27, user feedback): Esc must return to the services list

Diagnosed by the parent: `useGlobalKeys` (AppShell) owns
`cancel: goBack` / `chars.h` / `backspace` — Ink broadcasts every key to
ALL active useInput hooks, so Esc while the actions pane is locked BOTH
unlocked the pane AND navigated back off `/remote-home` (same for h/⌫).

- [x] S18 — Shared `pane-lock-store` (shared/lib, editing-store pattern):
      the page sets it in lock()/unlock() (+ unmount cleanup); while set,
      `useGlobalKeys` suppresses ONLY the back bindings (Esc/h/⌫ → no-op)
      keeping q/Ctrl-C quit intact; the page owns Esc and h as unlock.
      Tests: global suppression + page unlock without navigation.

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
- 2026-10-21 (iteration 2, branch feature/tui-status-screen stacked via
  fast-forward): S7–S10 completed by one delegated writer (4 RED→GREEN
  rounds). Live inventory end-to-end: strict `docker ps` parser + use case
  + adapter + `getContainers` service; hub renders real groups (compose
  label grouping, Others last, computed totals) with loading/empty/error
  states; labels in English (`Services`). Writer flagged a latent refresh
  race in iteration-1's `use-status.test.ts`; parent hardened it inline
  (`vi.waitFor` on the fetch call count before resolving the deferred) —
  3 focused runs + full suite green after.

## Verification evidence (iteration 2)

- `bun run test` (full, post flake-fix): 104 files / 920 tests passing.
- `bun run typecheck`: exit 0.
- ESLint scoped: `no-multi-comp: 0`, zero findings in the new/edited files
  (pre-existing findings remain in other docker-domain files — recorded
  repo-wide lint debt).
- Note: `use-remote-home` mirrors `use-status`; the same
  loading-paint/fetch-dispatch race documented there applies to both
  hooks' tests.
- 2026-10-21 (S11): collapsible groups shipped in two writer passes — the
  model slice (buildInventoryRows + 7 tests) landed, then the writer
  STOPPED correctly at the surface fence (RemoteHomeDashboard.tsx was
  missing from the derived surface; the ▼ glyph was hardcoded, not
  flag-driven); the parent authorized the file and the same writer session
  finished the UI slice. Spot check re-ran the focused suite (4 files /
  47 tests) + typecheck. Full suite 105 files / 937 tests green.
- 2026-10-21 (S11 correction round 2, user feedback): FINAL contract —
  collapsed group rows are selectable (the reopen handle: `❯ ▶ name` via
  the house cursor column), expanded group rows are pure headers (never
  focused), SPACE collapses the focused container's owner group / expands
  a focused collapsed row, Enter/l expands; DetailPanel group mode only
  for collapsed groups. The sticky-toggle mechanism from round 1 was
  removed entirely — with collapsed rows selectable, "space again
  expands" falls out naturally (collapsing a group's first container
  lands the cursor on the collapsed row at the same index). 105 files /
  944 tests green; focused suite stable ×3; parent spot check re-ran
  focused suite + typecheck.
- 2026-10-22 (S11 alignment fix, user screenshot): collapsed group rows
  rendered the cursor column and shifted right versus expanded rows.
  Final layout: ALL group rows start at column 0 with the glyph (no
  CursorColumn ever); focus on a collapsed row marks the glyph cyan in
  place (zero layout shift) plus the detail-panel switch. Container rows
  keep the cursor column. 105 files / 945 tests green; committed and
  pushed as `fix(tui): keep hub group rows at column zero` (user request
  2026-10-22).
- 2026-10-22 (R3-001 escalated — review-e5f5b53ca6955fd6, candidate C):
  reviewer escalated a CRITICAL: the /remote-home shim had no route-level
  test AND no no-remote redirect, diverging from the /status contract its
  own comment claimed. Fixed: the shim now redirects home when no remote
  is active (status-shim pattern) and `remote-home.test.tsx` covers props
  injection, key remount and the redirect (3 tests). Suite 107 files /
  956 tests. The escalated lineage stays terminal (informational); the
  gap is covered for the next review boundary. Chain outcome: A approved
  (acknowledged), B escalated (closed by status-shim tests), C escalated
  (closed by this fix).

## Iteration 3 route + delivery (2026-10-26)

Route: delegated direct — one writer (general agent). Trigger evidence:
2+ non-trivial files across three slices (shared hook, docker domain +
service, hub UI). Parent owns this doc; writer owns the listed source
files only. Forecast ≈ 600–700 authored lines (over the ~400 advisory →
delivery strategy ask-on-risk: ask once before the delivery commit if
chaining is wanted). Branch `feature/remote-home-container-actions` from
`main` (the old `feature/tui-remote-home-screen` branch is stale — its
commits landed via squash PRs #11/#12). TDD applies: RED observed before
each behavior slice, GREEN, then refactor; runner `bun run test`.

## Iteration 3 verification evidence (2026-10-26)

- Writer (delegated, foreground): `bun run test` → 116 files / 1085
  tests passing (4 green full-suite runs); `bun run typecheck` → exit 0;
  scoped eslint over all touched/new files → exit 0, zero findings.
  TDD: RED observed per slice (S12 keys, S13 domain ×3, S15 helpers,
  S16 page).
- Parent spot check: full suite re-run twice → 1084/1085 with a
  DIFFERENT flaking file each run (LogsPage r-reconnect, then
  RemotesMenuPage 4.8 timeout under parallel load — the documented
  pre-existing load-flake class; the writer reproduced the same profile
  on a stashed baseline). Focused: remotes-menu 22/22, all touched
  areas 24 files / 326 tests green; typecheck exit 0; scoped eslint
  clean after the parent's inline fix.
- Parent inline correction (1 mechanical file + 1 test assertion): the
  DetailPanel static line `↑↓ pick a container on the left` was stale
  while locked — removed (footer hints carry per-pane guidance:
  arrows pick / enter run / esc back).
- Diff: 12 tracked files + 6 new files, 1015+/75− (~1012 authored
  insertions, over the ~400 advisory — kept as one work unit; chaining
  to revisit at delivery per ask-on-risk).
- Commit pending user confirmation (repo rule). After the commit:
  RDD assess with `--base-ref main --committed-only` (RDD on, decided
  by global; boundary still `main` per the 2026-10-21 stop decision).
- 2026-10-27 (S18, user feedback): Esc/h/⌫ while locked ALSO fired the
  AppShell-global goBack (Ink broadcasts to every active useInput
  hook) — navigate(-1) threw the user off /remote-home instead of
  returning to the services list. Fix: shared `pane-lock-store`
  (editing-store pattern); `useGlobalKeys` suppresses only the back
  bindings while locked (q/Ctrl-C still quit); the page owns Esc/h as
  unlock plus unmount cleanup; backspace suppressed-only. NEW
  pane-lock-store(.test).ts + use-global-keys.test.tsx; page tests
  assert unlock WITHOUT navigation. Writer: focused 8 files / 126
  tests stable, full suite 118 files / 1100 tests green ×2 (other
  runs flaked only in the documented pre-existing class, each green
  in isolation), typecheck exit 0, scoped eslint exit 0. Parent spot
  check: focused 8/126 + typecheck OK. Delegation note: one attempt
  lost to a runtime restart (aborted; tree verified untouched before
  relaunch), the relaunch completed clean. Branch diff vs main: 13
  files changed, ~1186 insertions. Commit still pending user
  confirmation.

## Correction round 1 evidence (2026-10-27, S18)

- Root cause (parent): `useGlobalKeys` binds `cancel/h/backspace →
  goBack`; Ink broadcasts every key to all active useInput hooks, so
  Esc while locked unlocked AND navigated off `/remote-home`.
- Fix by the delegated writer (same session, TDD RED first): shared
  `pane-lock-store` (editing-store pattern); page sets it in
  lock()/unlock()/lifecycle-success + unmount cleanup; `useGlobalKeys`
  suppresses ONLY back keys while locked (q/Ctrl-C quit untouched);
  page binds h → unlock in the actions pane.
- New tests: pane-lock-store (3), use-global-keys (8, partial ink mock
  spying useApp().exit + memory router), page describe with a
  GlobalKeysProbe (AppShell never renders in a page harness — the probe
  mounts the global hook). One test hardened with vi.waitFor (React 19
  flushes unmount cleanup after paint).
- Verification: focused `test src/tui/shared/lib
  src/tui/pages/remote-home` → 8 files / 126 tests green (writer stable
  ×repeated; parent spot check re-ran it green); full suite 118 files /
  1100 tests green ×2 (other runs flaked ONLY in the documented
  LogsPage/RemotesMenuPage class, green in isolation); typecheck exit 0;
  scoped eslint exit 0.
- Delegation incident note: the server restarted mid-delegation (first
  attempt aborted with zero tree changes — verified by grep before
  relaunch); the relaunched same-session writer completed the fix.

## Commits + review-comment refactor (2026-11-08, user request)

User review comment on RemoteHomePage.tsx: move the actions into a hook
(cleanest code). Delivered in the same writer session:

- `refactor(tui): extract hub action keyboard into useRemoteHomeActions`
  (95fc743): NEW `model/use-remote-home-actions.ts` owns pane/
  actionCursor/command state, pane-lock sync + cleanup, the full
  useKeyBindings block (comments moved verbatim), per-pane hints and
  selectedContainerId; the page keeps composition/rendering
  (358 → 176 lines). Two flagged deviations, parent-verified: (1)
  `onToggleGroup` option (collapse state stays page-owned; space and →
  reach it through the hook); (2) useMenuList gates on the pane-lock
  STORE (`!locked ⟺ pane === 'list'`, committed together in
  lock/unlock/success) to avoid a render-order cycle between the menu
  cursor and the hook. Tests UNMODIFIED — zero behavior change proven.
- Writer: focused 4 files / 91 tests, full suite 118 / 1100 (no flakes
  that run), typecheck 0, scoped eslint 0. Parent spot check: focused
  91/91 re-run green + store-equivalence verified in source.
- Writer debugging lesson kept for future extractions: vitest/esbuild
  never typechecks — a missing import fails as a silent empty frame
  (Ink swallows the render error); run `tsc --noEmit` BEFORE the test
  suite when extracting hooks.
- Commit sequence (work units, all green at each tree):
  `05e83a6 feat(docker): add container start and restart over SSH`
  (focused at that tree: 24 files / 267 tests) →
  `96d7524 feat(tui): hub container action menu with selection lock`
  (full suite 118 / 1100 observed on the identical tree pre-commit) →
  `95fc743 refactor(tui): extract hub action keyboard into
  useRemoteHomeActions` (full suite 118 / 1100, typecheck 0).
  Pre-commit evidence: the stage alone held the OLD page with the NEW
  page tests (red tree) — the page was included so every commit is a
  green work unit. Push/PR remain user decisions; version bump at PR
  time per ADR-0017.
