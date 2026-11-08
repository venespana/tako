# tui-live-logs — Hub `l` key → live logs screen

## Objective

Pressing `l` on a focused container row of the Remote Home hub navigates to `/logs`,
which streams that container's logs in real time over SSH (`docker logs -f --tail N <name>`).

## Problem

The hub's detail panel registers container actions (`l` logs, `r` restart, `s` stop,
`i` inspect) but they are display-only. `/logs` is a stub (`<Text>logs</Text>`). No
log-streaming capability exists in the docker domain or services layer (the CLI has
`tako logs`, the TUI does not).

## Why

The hub is the operator's cockpit; "view logs" is the first registered action and the
one used most when a service misbehaves. Keyboard activation without leaving the
keyboard is the TUI's core interaction model.

## Scope

- T1 `stream-service`: docker-domain log streaming (port + use case + SSH adapter) and
  `streamContainerLogs` in `services/docker.ts`. Streaming keeps the SSH connection open
  until the caller stops the handle (pattern deviation from `getContainers`' `finally end()`
  is intentional and documented in-code).
- T2 `logs-screen`: real `LogsPage` (connect → stream → error/ended state machine), route
  shim reading `?container=` + app runtime store, guards redirecting to `/` (no remote) and
  `/remote-home` (no container). Buffer 500 lines, render the last ~100.
- T3 `hub-l-key`: `chars.l` in RemoteHomePage gated to focused container rows →
  `navigate('/logs?container=<name>')`; dynamic footer hints (`l logs` only when a container
  is focused). Collapsed-group rows keep the existing expand-on-`l` behavior.
- Out of scope: `r`/`s`/`i` actions, log pause/scroll/search keys, tab switching.

## Constraints

- No new dependencies; ssh2 `ClientChannel` streaming via `SshConnectionManager.exec`.
- Container identified by NAME (ids churn), shell-quoted, validated in-domain
  (`/^[A-Za-z0-9][A-Za-z0-9_.-]*$/`) before exec — refusal-object, never raw interpolation.
- FSD: pages never import `app/`; domain application never imports infrastructure;
  service wiring private + lazy (dynamic import) per ADR-0016/0019.
- Key precedence: `useMenuList`'s `l`-select stays; page-level `l` must no-op unless a
  container row holds the cursor (both handlers receive the key — Ink broadcasts).
- No commits without explicit user approval (repo workflow rule 1); version bump deferred
  to PR time (repo workflow rule 5).

## Tasks

- [x] T1 `stream-service` — port `ContainerLogStreamHandle`/`ContainerLogStreamer`
      (application), use case `StreamContainerLogs` (name validation + delegation), adapter
      `RemoteDockerLogsAdapter` (infrastructure: exec, StringDecoder line-split, stop →
      channel close; `done` resolves `'stopped' | 'ended'`), service
      `streamContainerLogs` + unit tests. Route: delegated writer (writer trigger: 3+ files).
      Evidence: RED (module-not-found ×3) → GREEN 44 tests; commit pending approval.
- [x] T2 `logs-screen` — `use-live-logs` model hook (phases: connecting/streaming/error/ended,
      500-line cap), `LogsPage` + dashboard/error views, `routes/logs.tsx` shim with guards,
      tests. Route: delegated writer (same brief). Evidence: RED (8 failing) → GREEN 18 tests;
      late-acquired handles are stopped instead of leaked; commit pending approval.
- [x] T3 `hub-l-key` — RemoteHomePage `l` binding + dynamic hints, hub tests (l on container
      navigates; l on collapsed group does not). Route: delegated writer (same brief).
      Evidence: RED (4 new tests) → GREEN 57 hub tests; commit pending approval.
- [x] T4 `ssh-keepalive-reconnect` — user-reported: the logs screen zombie'd at `streaming`
      overnight (SSH connection died silently — laptop sleep/NAT — no keepalive configured,
      `keepaliveInterval` defaults to 0). Fix: (a) `keepaliveInterval: 15000` in
      SshConnectionManager.buildConnectConfig so dead connections surface in ~45s and the
      channel closes → the screen leaves streaming; (b) `r` on the logs screen restarts the
      stream (hook `attempt` re-run; only offered in error/ended). Route: delegated writer.
      Evidence: RED (5 tests) → GREEN; 1015 tests pass; typecheck/lint exit 0; parent spot
      check re-ran typecheck → 0. Writer verified deviation: the manager test file uses
      objectContaining (no exact-shape config assertions to update). Known unrelated flake:
      RemotesMenuPage 4.8 under full-suite parallel load, passes in isolation/rerun.
      Still UNCOMMITTED per the user's deferral.
- [x] T5 `full-window-render` — user-reported residual: the dashboard rendered only the last
      100 buffered lines (VISIBLE_LINES cap) while the stream backfills 200, so the tail's
      first half was invisible next to the server's `docker compose logs` (which also adds a
      `container |` prefix the raw `docker logs` view lacks — cosmetic, single-container
      view, not replicated). Fix: render the FULL ring (drop the 100-line cap) and batch
      incoming line flushes (~100ms) in use-live-logs so a flood re-renders once per tick,
      not per line; flush pending lines before the ended/error phase lands. Route: delegated
      writer. Evidence: RED per behavior (150-row render; flood mid-frame buffer assert);
      GREEN 1020 tests; typecheck/lint exit 0; parent spot check re-ran typecheck → 0.
      The compose prefix difference stays out of scope (single-container view — prefix is
      redundant). Still UNCOMMITTED per the user's deferral.
- [x] T6 `static-log-render` — user reports newest lines appearing ABOVE older ones under
      flood. Code order verified correct (append-at-end); the scramble is Ink's full-frame
      redraw when the frame is taller than the terminal: history rewrites corrupt scrollback.
      Fix: render log lines via ink `<Static>` (append-only, written once, monotonic keys =
      absolute line offset so ring drops never re-emit) with the title/meta/status block as
      the pinned dynamic footer below (canonical tail -f layout). Route: delegated writer.
      Evidence: RED per behavior → GREEN 1024 tests; typecheck/lint exit 0; parent spot
      check re-ran typecheck → 0. Writer caught two integration defects: ink Static detects
      fresh items by array length (a capped ring must fold into an append-only accumulator
      or the tail freezes at 500) and Static inherits its box's wrap width (needs 100%
      root width or lines wrap at the footer's width). Still UNCOMMITTED per deferral.
- [x] T7 `viewport-window-render` — user reports: with T6's Static, logs flicker and
      disappear (Static block taller than the terminal breaks Ink's cursor math on each
      write). User proposed an inverted array + append-at-end — contradictory and it would
      put newest on top (their original complaint); rejected with evidence. Fix: drop
      <Static> entirely; render a viewport-bounded window of the ring (last ~stdout.rows
      minus chrome, sane floor/ceiling, fallback ~30) oldest→newest so new lines always
      append at the bottom and the frame never exceeds the terminal. Header/meta/status
      return to the top layout. Keep batching, ring, reconnect. Route: delegated writer.
      Evidence: RED per behavior → GREEN 1023 tests (run twice); typecheck/lint exit 0;
      parent spot check re-ran typecheck → 0. CHROME_ROWS = 14 (shell 9 + page 5) with
      floor 10 / ceiling 60, rows via useStdout (fallback 30). firstLineIndex and the ring's
      .first offset removed (no consumer left). T6's StaticLogStream.tsx deleted. Still
      UNCOMMITTED per deferral.

- [x] T8 `review-comments` — user review comments before committing: (a) the hook's
      render-phase `attempt !== pass` ring reset is replaced by a keyed remount
      (`LogsPage` renders its session body with `key={attempt}` — fresh state in the same
      commit, no render-phase setState, no effect-body reset, `attempt` leaves the hook's
      option surface); (b) `windowSize` extraction evaluated: single consumer today, so an
      exported pure `visibleRowCount()` in the dashboard module with unit tests instead of
      a speculative shared helper. Route: delegated writer. Evidence: RED per behavior —
      C1: after `r` the old code kept painting the DEAD pass's error view (the hook's
      phase survived the attempt bump; `● connecting` never rendered) → new page test
      asserts the fresh pass's connecting frame; C2: `visibleRowCount is not a function`
      ×4 → helper unit tests (fallback 16, floor 10, ceiling 60, mid 26). C1 typecheck RED
      observed too (`'attempt' does not exist in type 'UseLiveLogsOptions'` ×2). GREEN:
      1027 tests (113 files); typecheck/lint exit 0 (pre-existing react-plugin config
      warning only). `LogsSession` extracted to its own file (repo rule: one component
      per file, `react/no-multi-comp: 'error'` in production). WHY documented in-code:
      keyed remount over effect-body reset (which paints one commit of the superseded
      pass's stale ring and adds a render). Commits approved by the user for the whole
      branch after this landed (work-unit split, then RDD assess per commit) — commits
      recorded in Review outcome below.

- [x] T8 `review-comments` — user review comments before committing: (a) the hook's
      render-phase `attempt !== pass` ring reset is replaced by a keyed remount
      (`LogsPage` renders its session body with `key={attempt}` — fresh state in the same
      commit, no render-phase setState, no effect-body reset, `attempt` leaves the hook's
      option surface); (b) `windowSize` extraction evaluated: single consumer today, so an
      exported pure `visibleRowCount()` in the dashboard module with unit tests instead of
      a speculative shared helper. Route: delegated writer. Evidence: RED per behavior —
      C1: after `r` the old code kept painting the DEAD pass's error view (the hook's
      phase survived the attempt bump; `● connecting` never rendered) → new page test
      asserts the fresh pass's connecting frame; C2: `visibleRowCount is not a function`
      ×4 → helper unit tests (fallback 16, floor 10, ceiling 60, mid 26). C1 typecheck RED
      observed too (`'attempt' does not exist in type 'UseLiveLogsOptions'` ×2). GREEN:
      1027 tests (113 files); typecheck/lint exit 0 (pre-existing react-plugin config
      warning only). `LogsSession` extracted to its own file (repo rule: one component
      per file, `react/no-multi-comp: 'error'` in production). WHY documented in-code:
      keyed remount over effect-body reset (which paints one commit of the superseded
      pass's stale ring and adds a render). Commits approved by the user for the whole
      branch after this landed (work-unit split, then RDD assess per commit) — commits
      recorded in Review outcome below.

## Authorized edit surfaces

- `src/domains/docker/application/**` (new stream port/use-case files)
- `src/domains/docker/infrastructure/**` (new adapter)
- `src/services/docker.ts`, `src/services/docker.test.ts`
- `src/tui/pages/logs/**` (model + ui + tests, `index.ts`)
- `src/tui/app/routes/logs.tsx`, `src/tui/app/routes/*.test.tsx`
- `src/tui/pages/remote-home/ui/RemoteHomePage.tsx` + co-located test
- `src/tui/pages/remote-home/model/remote-home.test.ts`
- `src/domains/remotes/infrastructure/SshConnectionManager.ts` + co-located test (T4)

## Acceptance criteria

- On the hub, cursor on a container, pressing `l` lands on `/logs?container=<name>`.
- The logs screen shows recent output (--tail 200) and appends new lines live.
- `Esc`/`h` returns to the hub; unmount stops the remote stream and ends the SSH connection.
- Refusals (unknown remote, bad container name, transport error) render as error state,
  never as fake data.
- `bun run test && bun run typecheck && bun run lint` green.

## Delivery

Forecast ≈ 550 authored lines (> 400): strategy `ask-on-risk` (default) — ask once for the
chaining strategy before any further commit past the budget. All commits await explicit
user approval with proposed Conventional Commit messages.

## Progress

- 2026-10-22: feature doc created; branch `feature/tui-live-logs`; T1–T3 delegated to one
  bounded writer. Verification evidence pending writer report.
- 2026-10-22: T1–T3 implemented by the delegated writer with observed RED→GREEN per task.
  Verification of record (writer, foreground): `bun run test` 112 files / 1007 tests passed;
  `bun run typecheck` exit 0; `bun run lint` exit 0 (pre-existing react-plugin config
  warning only). Parent spot check re-ran `bun run typecheck` → exit 0. Changed surface
  matches the authorized list (6 modified files + new stream/logs files + this doc).
  Not covered by a runnable RED (pure wiring, stated): the `key={container}` remount
  behavior (props/guards are asserted). Actual ≈1,520 authored lines vs ≈550 forecast —
  tests and WHY comments kept intact per the no-truncation rule; size-only rework declined.
- 2026-10-22: correction (T1, user-reported): the logs screen streamed with zero lines —
  the adapter never consumed the exec channel's stderr, and docker demultiplexes the
  container's stderr onto `docker logs` stderr (AdGuardHome, a Go app, logs to stderr by
  default). Fix: two independent line pipelines (stdout + stderr, own StringDecoder/partial
  each) interleaving into one queue; daemon errors now surface as lines too. RED observed
  (3 new stderr tests failing against the old adapter) → GREEN 15/15; full suite 1010
  passed; typecheck OK; lint exit 0. Still UNCOMMITTED per the user's deferral.

  RDD review: pending — runs per work-unit commit once commits are approved. Commits:
  user deferred (2026-10-22) — work stays UNCOMMITTED on `feature/tui-live-logs` for the
  user's own review; do not commit until they say so.
- 2026-10-26: T8 (user review comments) landed; user approved commits — six work-unit
  commits recorded below; RDD review ran with consent and ended in an operator abandon
  (details in Review outcome); delivery follows ordinary repository policy.

## Review outcome (2026-10-26)

Commits (work-unit split on `feature/tui-live-logs`):
- 82fb315 docs(odd): plan tui-live-logs feature
- 5bd03cd chore(build): sync generated version file with package.json
- a528102 feat(docker): stream container logs over SSH with stoppable handle
- cae188a feat(tui): live logs screen behind /logs with container guard
- 2ff0aeb feat(tui): activate hub view-logs action with the l key
- 0cf4c81 fix(remotes): detect dead SSH connections via keepalive

RDD review: consent granted (risk high, 2386 lines / 22 paths) → lineage
`review-46855ae58f53ee0b`; risk/resilience/reliability lenses admitted; readability relay
refused 4× (`output_refused` — this runtime's review transport, not a lens verdict) →
abandoned by operator disposition; lineage reclaimed and quarantined. The three admitted
lenses' findings survive as quarantined artifacts and are recorded as follow-up
candidates below. Delivery follows ordinary repository policy; any PR needs the
package.json version bump (repo rule 5).

## Follow-ups (quarantined review findings — candidates, need user authorization)

- [x] FU1 (WARNING risk): validate+bound `tail` before it interpolates into the remote
      command (`StreamContainerLogs`/`RemoteDockerLogsAdapter`). → T9
- [x] FU2 (WARNING resilience/reliability): stop() teardown is fire-and-forget and
      `ManagedLogStream.stop()` can rethrow — await/catch at both call sites. → T10
      (single fix point: stop() never rethrows; sites documented, still void-safe)
- [x] FU3 (SUGGESTION resilience): on phase `ended` the handle is never stopped — the SSH
      connection idles open until unmount/`r`; stop it when the remote process exits. → T10
- [x] FU4 (SUGGESTION reliability): shim fires a real acquisition with empty remote before
      the redirect effect; gate the hook on remote !== ''. → T10 (mount-level guard in
      LogsPage — equivalent, one line instead of threading a prop)
- [x] FU5 (SUGGESTION reliability): reject zero/negative/non-integer tail at the boundary. → T9
- [x] FU6 (SUGGESTION reliability): \r-only sources never emit lines and grow the partial
      buffer unbounded — flush on \r or cap the buffer. → T9 (both: \r terminator + 8 KiB cap)
- [x] FU7 (SUGGESTION reliability): keepalive disconnect → hook-exit path has no end-to-end
      test (only config plumbing asserted). → T10 (real-hook + stubbed-service e2e-path test)
- [x] FU8 (SUGGESTION resilience): CHROME_ROWS=14 invariant is unchecked at runtime; a
      chrome change silently breaks the no-overflow guarantee. → T11 (`chromeRowCount()`
      single source of truth, unit test pins 14)
- [x] FU9 (SUGGESTION reliability): route test leaks a rendered instance across store
      resets — unmount in the test harness. → T11
- [x] FU10 (flake class): fixed settle budgets (1000–2000ms) across ink tests are too tight
      for loaded CI — RemotesMenuPage 4.8 failed in CI and LogsPage r-reconnect flaked once
      locally; sweep all test files to condition-based budgets with CI-load headroom. → T12
      (ROOT CAUSE found: KEY_FLUSH_MS gated a RETRY — delivered keys echoed after 350ms
      were re-sent, duplicating chars in the ACK-per-char password flow; all budgets now
      CI-scaled constants in ink-interactions.ts; 10/10 consecutive green full suites)

## Iteration 2 — FU follow-ups (2026-11-08, user authorized)

The quarantined findings ship as two writer passes on a fresh branch
`fix/live-logs-review-findings` from `main` (the original work shipped via
PR #12 / `8342ec6`). Route: delegated direct, one
writer per pass (trigger: ≥2 non-trivial files per pass); parent owns this
doc; TDD with RED per behavior. Forecast ≈ 450–600 authored lines (mostly
tests) — over/near the ~400 budget → strategy ask-on-risk at delivery.

- [x] T9 `fu-command-boundary` (FU1+FU5+FU6) — docker-domain hardening:
      strict `tail` validation in `StreamContainerLogs` (integer, 1..10000,
      refusal otherwise — before the port; service default 200 unchanged) and
      CR handling in `RemoteDockerLogsAdapter` line pipes (lone `\r` is a
      terminator like `tail -f`; partial buffer capped ~8 KiB flushed as a
      line). Tests: boundary refusals (0, -1, 1.5, NaN, 10001, '200'),
      \r-only stream emits lines, \r\n stays one line, oversized partial
      flushed.
- [x] T10 `fu-lifecycle` (FU2+FU3+FU4+FU7) — stream lifecycle integrity:
      `ManagedLogStream.stop()` never rethrows (catch inside, still ends the
      connection); the hook awaits-and-catches both stop call sites; on
      `done` resolving `'ended'` the hook stops the handle (connection
      closes without unmount/r); the `/logs` shim gates the hook on
      `remote !== ''`; NEW end-to-end-path test: keepalive-style channel
      close → `done: 'ended'` → hook transitions and stops the handle.
- [x] T11 `fu-hygiene` (FU8+FU9) — CHROME_ROWS invariant asserted by a unit
      test deriving the rendered chrome rows (single source of truth for the
      constant), route-test harness unmounts its rendered instance.
- [x] T12 `fu-flake-sweep` (FU10, after T9–T11) — sweep ink test timing:
      condition-based settle with CI headroom in `src/tui/test-utils/
      ink-interactions.ts`, raise the connect-gate suite budget (VEN-1), no
      production-code changes. Acceptance mirrors VEN-1: 10 green local
      full-suite runs; CI green twice.

## Iteration 2 verification evidence (2026-11-08)

- Pass 1 (T9–T11, delegated writer ses_e43937399ffe5XPyo6nthHGB6R): RED
  observed per slice (6 tail-boundary failures, 4 CR-handling failures,
  stop-rethrow, ended-path stop=0, empty-remote acquisition, missing
  chromeRowCount) → GREEN; suite 113 files / 1044 tests (base on this
  branch was 113/1027 — main's tree; the container-actions numbers
  118/1100 belong to the unmerged PR #13 branch); typecheck 0; scoped
  eslint 0. Two writer decisions parent-verified sound: FU4 as a
  mount-level guard in LogsPage (equivalent to enabled=remote!=='' with
  less threading) and the ended-path self-stop clearing the local handle
  (exactly-one-stop-per-pass asserted on both sides of unmount).
- Pass 2 (T12, delegated writer ses_e43842d99ffecGoi0JjtSHGxfZ): timing
  policy centralized as CI-scaled constants in ink-interactions.ts
  (KEY_FLUSH_MS/DEFAULT_SETTLE_MS/CONNECT_TIMEOUT_MS/LOAD_TIMEOUT_MS,
  ×3 under CI); 15 test files swept to helper defaults; 13 connect-gate
  tests carry explicit LOAD_TIMEOUT_MS; ROOT CAUSE of the 4.8 CI
  failure identified and fixed at the source (retry-gated KEY_FLUSH_MS
  re-sent delivered keys, corrupting ACK-per-char passwords).
  Acceptance: 10 consecutive green full-suite runs (1044 each, 0
  failures across runs; logs /tmp/opencode/fu10-runs/); typecheck 0;
  scoped eslint 0. CI-green-twice pending commit+push (human-gated).
- Parent spot checks: full suite re-run green after each pass (113/1044
  + typecheck OK). Delivered surface: 2 domain files + adapter + service
  + hook + page + dashboard + shim (T9–T11) and ink-interactions + 15
  test files (T12) — all within the authorized surfaces, odd/ doc
  parent-owned.
- DELIVERED 2026-11-08 (user validated + ordered merge): 5 commits
  rebased onto #13 (`6061d2d`/`3ec69dd`/`ee1921a`/`4f1caac`/`63f6e67`
  + bump `0.4.1`), shipped as PR #14 — squash `25bbbb0` on main.
  Rebase conflict resolved by taking main's pane-lock tests and
  re-applying the budget policy. CI caught the T12 residual the writer
  had flagged (heavy hub/logs tests cross vitest's 5s default under
  CI-scaled budgets) → corrective commit `8dbc70b`: explicit
  LOAD_TIMEOUT_MS on every RemoteHomePage and LogsPage test + unused
  import cleanup; verified in CI MODE locally (CI=true, ×3 budgets:
  118 files / 1117 tests) BEFORE pushing. CI green twice on the PR
  head (run 42515036769 + rerun) → Linear VEN-1 CLOSED (Done, with
  evidence comment). Full-suite counts on main now: 118 files / 1117
  tests.
