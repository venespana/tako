# Exploration rev 3: `tako doctor` on the landed React Router tree

> Change: `explore-doctor-command` · Phase: explore (rev 3) · Store: hybrid
> Supersedes rev 2 (Engram #408). Rev 2's crisis (dangling router chain) is RESOLVED — the chain landed on local `main`. Two NEW blockers emerged: origin divergence and lost filesystem SDD artifacts.

## 1. Repository / branch state (verified 2026-09-03)

- Current branch: `feat/tako-doctor` @ `626f466` == local `main` == `feat/tui-react-router`. Working tree clean.
- ⚠️ **local `main` DIVERGED from `origin/main`**: merge-base `0d5a15f` (PR #2); main is 26 ahead / 1 behind. The missing commit is `8c31947` (PR #3 home-screen merge). The router chain re-implements the home screen (`f47b315` base layout), so #3's content is superseded — but git cannot fast-forward. Landing decision still OPEN: merge `origin/main` into `main` (resolve in favor of the chain) or PR the chain. Force-push would rewrite shared history.
- ⚠️ `origin/feat/tako-doctor` holds an OLD doctor implementation (`aa21701` "doctor command with normalized output"). The local branch name collides with its own remote; pushing later will diverge. Delete/rename the remote branch first.
- Stale branch `feat/tui-home-screen` (`08ae6d2`) still exists locally.
- Health: unit tests **202/202 green**; `tsc --noEmit` clean. (Rev 2's "3 pre-existing test failures" were fixed by `8166a67`.)

## 2. CLI doctor today

- `src/cli/index.ts`: doctor command registered with a **STATIC top-level import** of `./commands/doctor.js` — unlike `remote add`, which lazy-imports (`await import`, comment: "required for compile"). Design D2 (lazy Ink boundary) is still unapplied.
- `src/cli/commands/doctor.ts`: composes `LocalHostToolChecker` + `CheckHostDependencies`; prints EVERY tool via `formatToolLine` (picocolors) + `--- SUMMARY ---` + `x/y tools found`; returns `allPresent ? 0 : 1`. **Exit-code contract already correct.**
- `src/cli/commands/doctor-report.ts` (+ test): 11-line pure all-tools formatter. Deletion candidate (design D1).
- Domain (`src/domains/system/**`) is final for this change — no modifications needed:
  - `domain/required-tools.ts`: **5 tools** (`ssh`, `ssl`, `git`, `docker`, `docker-compose`).
  - `application/CheckHostDependencies.checkAll()` → `SystemCheckResult { results, allPresent }`; port `HostToolChecker`; adapter `LocalHostToolChecker` (Bun.spawn).

## 3. TUI architecture (landed React Router v8)

- Entry `src/index.tsx`: bare `tako` → lazy Ink `render(<App/>, { alternateScreen: true })` + `waitUntilExit()`; args → `runCli()`.
- `App.tsx`: `useState(createAppRouter)` (one memory router per mount) + `AppRuntimeContext` (session-scoped activeRemote) + `<RouterProvider/>`.
- File-based routes `src/tui/app/routes/*.tsx` → generated `routes.generated.ts` (`bun run generate:routes`); `doctor` path present.
- **`/doctor` wiring is COMPLETE**: menu-registry item `{ id: 'doctor', route: '/doctor' }` → `use-menu-navigation` (select = `navigate(route)`); route shim `routes/doctor.tsx` → `pages/doctor/index.ts` → **`DoctorPage.tsx` stub (`<Text>doctor</Text>`)**. Filling the stub needs ZERO route/registry work, no regeneration.
- **D7 collapsed**: no `dispatch/` directory, zero `console.log` in `src/tui` — verification only.
- All other command pages are stubs; `remotes-add` (page embedding `AddRemoteWizard`) is the only filled precedent.

## 4. ADR-0014 pattern (as actually implemented)

- CLI composes adapters + use cases, delegates to feature `run.ts`: `render(<Comp onComplete/>) → Promise<Result>` with resolve-once guard + `unmount()`; maps result → exit code (`remote-add.ts`).
- eslint zones (`eslint.config.js`): cli→tui forbidden **except `src/tui/features/remotes/add-remote-wizard/**`**; plus an FSD rule 4-2 zone forcing cross-slice imports through the wizard's `index.ts` — and `src/cli/**/*` is inside that zone's targets, so **CLI imports the slice's public API (`index.js`), not `run.ts` directly** (ADR-0014's prose says `run.ts`; code says `index.js` — minor drift worth fixing in wording when doctor joins).
- Doctor requires TWO eslint edits: (a) widen the cli→tui `except` to include `src/tui/features/doctor/**`; (b) add a mirrored FSD 4-2 zone so all consumers import `features/doctor` via its `index.ts`.
- `src/index.tsx` header comment ("the one sanctioned cli→tui exception") needs updating when doctor joins — generalize or extend the wording (same for ADR-0014 §4).

## 5. Pipeline / artifact state (hybrid)

- ⚠️ **`openspec/changes/explore-doctor-command/` never existed in git** (`git log --all` on the path is empty) and is absent from the working tree. Rev 2's `exploration.md`, `proposal.md`, `design.md` were untracked files lost during the router landing. **Engram retains full content: explore #408, proposal #404, design #406.**
- Recovery for next phases: recreate the change dir; re-materialize `proposal.md` + `design.md` from Engram **applying the rev-2 correction list** (design still references `ROUTE_REGISTRY`, `src/tui/app/router/`, zustand store, flat `features/doctor/*` files — actual shape: route shim + FSD-segmented slice `{lib/, model/, ui/, index.ts}` + `pages/doctor` stub fill).
- `openspec/changes/tui-router-zustand/` is unarchived and stale: tasks reference `src/tui/app/router/router-*` (zustand) which no longer exists; no `verify-report.md`. What landed is react-router v8, not zustand — archive hygiene owed (non-blocking for doctor).
- Main spec `openspec/specs/host-dependency-check/spec.md` says **THREE tools**; implementation has **FIVE**. The delta spec must reconcile: Required Tools Enumeration 3→5, Report Output Format → missing-only view, ADDED dual-invocation requirement (same screen CLI/TUI; exit codes on standalone path).
- `docs/commands.md` already lists `tako doctor` — closed command contract intact.
- Review budget: project config `review_budget_lines: 800` (overrides 400 default).

## Approaches

1. **Shared DoctorScreen feature slice (ADR-0014 mirror)** — RECOMMENDED (confirmed by proposal #404 + design #406; rev 3 re-validates feasibility: route wired, stub ready, tests green).
   - Steps: fill `DoctorPage` stub; create `src/tui/features/doctor/{lib/run.ts, model/useDoctorCheck.ts, ui/DoctorScreen.tsx, index.ts}` (+ pure view-model per design); rewire `cli/commands/doctor.ts` → `runDoctor({runCheck}) → 0|1` + `runDoctorDefault()`; make `cli/index.ts` doctor action lazy; widen eslint except + add 4-2 zone; delete `doctor-report.ts` (+test); delta spec 3→5.
   - Pros: one screen both paths; exact wizard precedent; zero route work; exit-code contract already proven; missing-only projection is a pure function over `SystemCheckResult`.
   - Cons: two eslint zone edits; piped (non-TTY) stdout keeps Ink escape sequences (accepted deferral, decision 3).
   - Effort: Low–Medium.
2. **Separate CLI formatter + TUI screen** — keep plain-text CLI report; build only the TUI screen.
   - Pros: clean piped stdout; no eslint changes; smallest diff.
   - Cons: two report implementations to keep in sync; drops the proposal's "ONE shared screen" intent; keeps `doctor-report.ts` alive.
   - Effort: Low.
3. **Generalized command→screen convention now** — extract a generic runner/deeplink for command pages (doctor, logs, status…).
   - Pros: scales to the remaining stub pages; one convention for all.
   - Cons: speculative abstraction (only one filled page exists today); blows review budget; needs its own ADR.
   - Effort: High.

## Recommendation

Approach 1, unchanged from rev 2 — and now CHEAPER: rev 2's Task 0 (land the router chain) is done locally. The sequencing constraint moved from "land the chain" to **"publish the chain"**: resolve the `main` ↔ `origin/main` divergence (merge or PR) BEFORE basing the doctor PR. Estimated ~250–350 changed lines (design's file table + tests) fits the 800-line project budget in a single delivery — no chained PRs needed.

## Risks

- `main` ↔ `origin/main` divergence (26 ahead / 1 behind; #3 superseded): doctor PR has no clean base until the user picks a landing strategy (merge origin/main in / PR the chain).
- Filesystem SDD artifacts for this change are lost (only in Engram) — re-materialize `proposal.md`/`design.md` with rev-2 corrections BEFORE spec/tasks, or those phases will reference nonexistent zustand artifacts.
- `origin/feat/tako-doctor` name collision with an obsolete implementation — delete/rename the remote branch before pushing.
- Spec drift (3 vs 5 tools) — verify will fail unless the delta spec reconciles.
- `tui-router-zustand` change unarchived/stale (zustand tasks vs react-router landing) — hygiene debt, non-blocking.
- Non-TTY Ink output (`tako doctor | cat`) — accepted deferral (decision 3).
- Ink final-frame persistence on unmount under Bun (design open question D5) — verify during apply; bounded keypress-wait fallback is contained.

## Ready for Proposal

Yes — and further: proposal #404 and design #406 ALREADY EXIST in Engram and remain directionally valid under the landed tree. No new proposal round is needed. Next: (1) user decision on origin landing strategy; (2) restore the change folder from Engram applying rev-2 corrections; (3) proceed to `sdd-spec` (delta reconciliation 3→5 tools + missing-only + dual invocation).
