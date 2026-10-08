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

### Fase 2 — absorb features/tasks into pages/tasks (delegated writer ses_f02e15d23ffe3Ow932WorRRDj7)
- [x] F2-T1 6 slices absorbed into pages/tasks model/+ui/ segments (20 tracked renames,
      91-100% similarity), domain-based names, public API shrunk to externally-referenced
      surface (TasksPage, useTasksStore, resetTasksStoreForTests, assertAgentSocketPresent,
      TasksGateway, AgentInstallOutcome).
- [x] F2-T2 Consumers rewired: app/routes/index.tsx + test, app/routes/tasks.tsx,
      test-utils/fake-agent-session.ts (deep import eliminated — types via page API).
      features/tasks/ deleted: 6 barrel index.ts files; 13 import statements rewired.
- [x] F2-T3 ActionMenu inversion: widget owns RenderableActionItem {id,label,enabled} +
      RenderableActionGroup via its index; zero widget→features imports; features/menu
      keeps richer GatedAction* types (structural compatibility); pages compose both
      (home-menu.ts, remotes-menu.ts type-annotate with widget's contract — 2 minimal
      out-of-surface edits, reported and parent-verified as exactly that).
- [x] F2-T4 Suite green: lint 0 errors (2 pre-existing warnings), typecheck clean,
      test 760/760 (88 files) — identical to F1 baseline.
- Commit: `5817eca` (191+/210-, 42 paths with rename detection).

### Fase 3 — services layer (delegated writer ses_f02a0c272ffeiHQk3oxVJ0jy3f)
- [x] F3-T1 src/services/{remotes,agent,docker,system}.ts: complete domain functions
      (refusal-object outcomes, AsyncIterable where streaming); toolstack/conf/auth
      private; contract types re-exported (entities/job + pages/tasks off domains).
- [x] F3-T2 Probe 9.17 + assertAgentSocketPresent pushed down (run by connectAgentSession,
      manager close-on-failure preserved, now tested).
- [x] F3-T3 decideRemoteAuth unified (refusal-object, ONE message per outcome — user-facing
      message delta recorded); SSH toolstack mirrors deleted from cli+tui; conf triple
      private; lazy adapter imports disciplined in services.
- [x] F3-T4 TUI consumes services: routes/tasks passes plain data; TasksGateway removed;
      tests mock services (vi.mock + importOriginal spread); store = view-state only.
- [x] F3-T5 CONDITIONAL — LEFTOVER: remaining cli→tui imports are exactly the agreed
      interactive-UI slices (doctor format, add-remote wizard). Making remote-add
      flags-only is a product decision — NOT taken unilaterally. eslint/ADR-0014/AGENTS.md
      untouched; follow-up decision pending.
- [x] F3-T6 Suite green: lint 0 errors (2 pre-existing warnings), typecheck clean,
      test 793/793 (93 files; +33 service-level tests). Surprise fixed: latent-broken
      integ/e2e imports referencing a symbol agent-install never exported.
- Split commit sequence (user rule: no commits without code review; F3 single commit
  exceeded the native lens context budget at HIGH risk → provider prescribed chained
  smaller candidates):
  - e9c9b11 piece 1 services — STAGED review: consent granted, 3/4 lenses admitted
    (risk/resilience/reliability), readability lens deterministically unmaterializable
    (4/4 output_refused → capture-unachievable recorded, stop unachievable_lens_slot);
    user personally reviewed the staged diff and approved → committed. READABILITY GAP
    OPEN on this slice.
  - bc447fa piece 2 cli (172+/764-) — user waived personal review for end-of-day commit;
    PENDING native review (committed-only, base e9c9b11).
- Commit: final piece 3 below; assess vs 5817eca was high_risk/slice_budget (3586 lines).

### Fase 4 — enforcement
- [ ] F4-T1 eslint zones: shared↖nobody, domains↖cli/tui, application↖infrastructure,
      FSD layer direction in tui; remove *.test.* globalIgnores → scoped test config.
- [ ] F4-T2 ADR-0016 whitelist: add src/cli/commands/agent-run.ts.
- [ ] F4-T3 knip + steiger (devDeps + config + scripts; CI wiring is a later decision).
- [ ] F4-T4 cli/index.ts --version reads generated version file.
- [ ] F4-T5 Suite green; audit violations re-scan = zero.

## Progress
- 2026-10-02: branch feature/architecture-layers created (from feature/remote-agent HEAD).
- 2026-10-02: F0 complete — committed `999d1c2` (4 docs files, user-approved).
- 2026-10-02: F1 complete — committed `ed582a0` (11 deleted, 7 edited; suite 760/760);
  hygiene `82ba55f` (.gitignore += .codegraph/, feature doc tracked).
- 2026-10-02: slice F0+F1 native review: consent granted, lineage review-5998dff5d7a6544e,
  1 lens (review-reliability), APPROVED (1 advisory informational R3-001), acknowledged,
  authority burned. Boundary → 82ba55f.
- 2026-10-02: F2 complete — committed `5817eca` (tasks absorption + ActionMenu inversion);
  native review lineage review-89ff96c15da96a72: 3 output_refused then capture-unachievable
  declared, user chose withdraw+retry, attempt 4 materialized → APPROVED ZERO findings,
  acknowledged, authority burned. Boundary → 5817eca.
- 2026-10-02: F3 complete (services layer + pushdowns + thin cli). Single-commit review
  exceeded lens context budget (high risk) → split into 3 reviewed-before-commit pieces
  per user rule: e9c9b11 (services; user-reviewed; readability lens gap open),
  bc447fa (cli; review pending), piece 3 (tui; commit below; review pending).
- 2026-10-02: USER RULE recorded: prefer typed objects with functions over switch-case
  (engram #672); add to AGENTS.md Conventions in F4. USER RULE: no commits without code
  review — end-of-day exception taken explicitly by user for pieces 2-3; review debt
  tracked below.
- 2026-10-02: ENGRAM/ops notes: MCP writes blocked by ended-session binding (CLI fallback);
  gentle-ai review commands pollute the git index — always reset+add+commit atomically
  (engram #673).

## Verification evidence
- F0: writer prettier verbatim + parent readback + parent prettier spot check. 999d1c2.
- F1: writer lint/typecheck/test verbatim + parent 18-path readback + residue grep 0 +
  parent typecheck spot check. ed582a0.
- F0+F1 review: consent/v3 relayed, granted; capture admitted (1 retry); approved;
  acknowledge-approved burned (2430ab99...).
- F2: writer lint/typecheck/test verbatim + parent rename-map readback + 2 out-of-surface
  edits parent-verified minimal + parent typecheck spot check. 5817eca.
- F2 review: consent granted; 3 refusals → declared unachievable → user withdraw+retry →
  attempt 4 admitted → APPROVED zero findings → acknowledged (eee6584d...).
- F3: writer lint/typecheck/test verbatim (793/793) + parent greps (production tui→domains
  zero in touched slices; toolstack zero in cli/tui) + parent full-suite spot check
  793/793. e9c9b11 / bc447fa / piece 3 below.

## Review debt (open)
- RESOLVED 2026-10-08 (E0): bc447fa + 49eabe0 reviewed natively — lineage
  review-5e05631497fec546, medium, 1 lens review-reliability, materialized first attempt,
  APPROVED with 4 advisory WARNINGs (non-blocking, no correction offered), acknowledged,
  authority burned. Boundary → 49eabe0 (HEAD).
- e9c9b11 readability lens gap — OPEN: user's personal review stands as substitute;
  recorded (stop unachievable_lens_slot, 4/4 refusals).
- Advisory verification debts → folded into E2/E4:
  - R3-001 cli install: assert refusal reason on STDERR (not just exit codes)
  - R3-002 cli status: assert stdout/stderr routing + message prefixes
  - R3-003 uninstall: restore behavioral coverage (teardown ordering, linger
    preservation, residue exit 1) at services level — destructive command
  - R3-004 9.17 typed socket-error contract: services-level test proving the typed
    error + close-on-failure survives the pushdown
- Follow-up decisions: ADR-0014 leftover → RESOLVED by E1 product decision (CLI
  non-interactive, remote-add flags-only); remaining production tui→domains imports in
  remotes/doctor slices → E2 migration; AGENTS.md convention line (typed objects over
  switch-case) → E1.

## Deliverables (agreed 2026-10-08)
- [x] E0 Review-debt closure (this review).
- [ ] E1 Architecture remainder: ADR-0020 CLI strictly non-interactive (no TUI views,
      no forms; flags/stdin xargs-style; confirmations as plain field lists); ADR-0014
      fully superseded; AGENTS.md dependency rules + switch-case convention.
- [ ] E2 CLI/TUI update: remote-add flags/stdin (delete add-remote-wizard slice);
      doctor formatting out of tui/features; migrate remaining tui→domains imports
      (remotes/doctor slices); restore R3-001/002/003 assertion coverage.
- [ ] E3 Dead-code cleanup: knip scan + manual sweep AFTER E2 (wizard corpses).
- [ ] E4 Validation: eslint zones (shared/domains/application/FSD + scoped *.test.*
      config), steiger + knip scripts, zero-violation re-scan, flaky remotes test
      hunt, R3-004 services test, full suite.
- [ ] E5 Delivery: version bump (repo rule 5), PR architecture-layers → main.

## Next step
E1 (docs: ADR-0020 + AGENTS.md) — writer + user code review before commit.
