# Architecture Layers — server/clients redesign

## Objective
Redefine Tako's architecture contract to a server/clients model: `src/services/<domain>`
exposing complete domain functions (API-style) imported equally by TUI (FSD, interactive)
and CLI (non-interactive endpoints); all business logic and adapter wiring private inside
services/domains. Align FSD policy with the bundled FSD v2.1 skill, and give every
documented rule a mechanical check or an explicit `review-only` marker.

## Problem
Audit on feature/remote-agent found 6 contract violations invisible to CI (no FSD eslint
zones; *.test.* fully lint-excluded), ~10 dead files from the dispatch→routing migration,
SSH-stack + conf wiring duplicated at 6 sites synced by comments, and the bundled FSD skill
contradicting the repo's own ADRs (widgets, single-use slices).

## Why
User-requested architecture rethink. Model agreed in session 2026-10-01 (engram #586–#590;
full design detail delivered in-chat and approved 2026-10-02).

## Scope (authorized)
Phases F0–F4 below. Docs in F0; deletions F1; moves F2; new layer F3; gates F4.
NOT in scope: literal network server (in-process only); new user-facing features;
renaming existing commands; touching openspec archives.

## Constraints
- AGENTS.md rules override defaults: human-in-the-loop commits (propose, wait, then commit),
  branch feature/* only, version bump per PR (patch for these phases), conventional commits,
  no Co-Authored-By.
- Behavior-preserving in F1–F3: existing suite is the safety net; suite green before/after
  each work unit. F3 may add unit tests for new use cases.
- Artifact language: English. Reply language: Spanish (rioplatense).

## Delivery strategy
ask-on-risk (default). Forecast >400 authored lines total; strategy proposed at each commit
gate. Each phase = work-unit commit(s) on this branch.

## Route declaration
All tasks delegated direct (trigger: ≥2 non-trivial files per task; parent keeps thin
context). Parent verifies structurally + one spot check before proposing each commit.
F0 exceptions: parent closed 3 pre-existing AGENTS.md table inaccuracies inline (mechanical
single-file fix) and removed its own scratch prompt file.

## Checklist

### Fase 0 — contract docs (delegated writer ses_f03857d8affekR47IZRSwQqD1j)
- [x] F0-T1 `docs/decisions/0018-fsd-layer-policy.md` — 6 agreed policy points, ADR format
      per repo convention. Verified by parent readback.
- [x] F0-T2 `docs/decisions/0019-services-layer.md` — server/clients model, 7 decision
      points, ADR-0014 supersession marked transitional. Verified by parent readback.
- [x] F0-T3 AGENTS.md — services row, ADR-0019 dependency rules (ADR-0014 transitional),
      review-only principle. Verified via diff + readback.
- [x] F0-T4 docs/architecture.md — rewritten: 4 domains, real kernel (2 files, no
      Result/Maybe/TakoError), services section (arrives F3), enforced/review-only column.
- [x] F0-T5 Verify: parent re-ran `bunx prettier --check` on all 4 files → "All matched
      files use Prettier code style!". Writer reported same.

### Fase 1 — dead code deletion (delegated writer ses_f032116d4ffeS6LTFet4BhkBZw)
- [x] F1-T1 Deleted legacy widgets: Logo.tsx, VersionBar.tsx, KeyHints.tsx, KeyHints.test.tsx,
      VersionBar.test.tsx, widgets.test.tsx (importer count 0 verified per file).
- [x] F1-T2 Deleted menu/dispatch/index.ts, navigation.ts + test; removed DispatchMap AND
      handlerKey everywhere — writer audit: zero runtime readers (writers/declarations/
      fixtures only), routing replaced it with the `route` field. menu/index.ts verified
      clean (no dispatch/navigation re-exports).
- [x] F1-T3 Deleted doctor/lib/run.ts + run.test.ts; doctor/index.ts exports removed and
      comment corrected (cli→tui transitional per ADR-0019).
- [x] F1-T4 Suite green: lint PASS (0 errors, 2 pre-existing warnings), typecheck PASS,
      test 760/760 (88 files; 5 deleted test files account for the count drop). Flaky
      remotes redaction test did not flake.

### Fase 2 — absorb features/tasks into pages/tasks
- [ ] F2-T1 Move 6 slices (workspace, job-list, job-form, job-history, dry-run-preview,
      install) into pages/tasks as segments; public API at pages/tasks/index.ts.
- [ ] F2-T2 Update external consumers: app/routes/index.tsx + index.test.tsx,
      app/routes/tasks.tsx, test-utils/fake-agent-session.ts (deep import fix).
- [ ] F2-T3 ActionMenu inversion: RenderableActionGroup defined in widgets/action-menu;
      features/menu conforms; delete widgets→features imports (resolves violation 1.1).
- [ ] F2-T4 Suite green.

### Fase 3 — services layer
- [ ] F3-T1 Create src/services/{remotes,agent,docker,system}.ts: complete domain functions,
      minimal params, typed results, AsyncIterable streams; all wiring private.
- [ ] F3-T2 Push down: agent-socket-probe, assertAgentSocketPresent (tui→services.agent).
- [ ] F3-T3 Unify decideRemoteAuth (refusal-object style wins); thin CLI commands
      (parse → service → print); extract buildSshToolstack + conf triple to services.
- [ ] F3-T4 TUI consumes services only: entities/job type via services; route shims direct
      imports; tasks-store keeps view-state only.
- [ ] F3-T5 Delete ADR-0014 exceptions (eslint except globs + docs); ADR-0014 marked
      superseded by 0019.
- [ ] F3-T6 Suite green + new unit tests for pushed-down use cases where meaningful.

### Fase 4 — enforcement
- [ ] F4-T1 eslint zones: shared↖nobody, domains↖cli/tui, application↖infrastructure,
      FSD layer direction in tui; remove *.test.* globalIgnores → scoped test config.
- [ ] F4-T2 ADR-0016 whitelist: add src/cli/commands/agent-run.ts.
- [ ] F4-T3 knip + steiger (devDeps + config + scripts; CI wiring is a later decision).
- [ ] F4-T4 cli/index.ts --version reads generated version file.
- [ ] F4-T5 Suite green; audit violations re-scan = zero.

## Progress
- 2026-10-02: branch feature/architecture-layers created (from feature/remote-agent HEAD).
- 2026-10-02: F0 complete — 4 files written by delegated writer, 3 AGENTS.md table fixes
  closed by parent, Prettier clean.
- 2026-10-02: F0 committed as `999d1c2` (user-approved; 270+/64-).
- 2026-10-02: F1 complete — 11 files deleted, 7 edited (1 companion test edit justified:
  menu-registry.test.ts asserted handlerKey). Suite 760/760. Committed as `ed582a0`
  (user: "continua"; pre-commit hook had swept in 2 untracked files — amended to restore
  the approved 18-path scope before finalizing).
- 2026-10-02: hygiene commit `82ba55f` — .gitignore += .codegraph/, feature doc tracked.
  Unblocked the review preflight (eligible untracked inventory was blocking START).
- 2026-10-02: native review of slice F0+F1 (24 files, 925 lines): consent GRANTED by user
  → lineage review-5998dff5d7a6544e, medium risk, 1 lens (review-reliability) → APPROVED
  → acknowledged, authority burned. Advisory (non-blocking, informational): R3-001
  doctor/index.ts deleted render bridge — recorded as follow-up context, no correction
  offered. Reviewed boundary advances to `82ba55f`.

## Verification evidence
- F0: writer verification report (prettier --write + --check, verbatim in session) + parent
  structural readback of 0018/0019/architecture.md + parent spot check re-running
  `bunx prettier --check` → clean. `git status`: only the 4 surface files modified/added.
- F0 commit identity: 999d1c2 on feature/architecture-layers.
- F0 assess: medium (executable_change AGENTS.md), 334 lines, review_due=false under_budget
  (first assess attempt needed --untracked-scope=exclude with inventory
  sha256:c43a7939...; recorded for future assess runs).
- F1: writer lint/typecheck/test verbatim + parent readback (git status = exactly 18
  expected paths; residue grep handlerKey|DispatchMap|buildDefaultDispatch|runDoctorScreen
  = 0 matches) + parent spot check `bun run typecheck` → clean.
- F1 commit identity: ed582a0 (4+/466-). Hygiene: 82ba55f.
- Review: consent/v3 relayed losslessly, granted; capture admitted (1 retry after
  output_refused, same slot reoffered); state approved; acknowledge-approved burned
  authority (review-acknowledged/v1, consumed_revision 2430ab99...).

## Next step
F2 writer: absorb features/tasks/* into pages/tasks + ActionMenu inversion → verify →
commit → assess with --base-ref 82ba55f.
