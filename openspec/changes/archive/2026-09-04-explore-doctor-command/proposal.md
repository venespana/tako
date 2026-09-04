# Proposal: `tako doctor` — shared CLI/TUI diagnostic screen

> Rev 2 — re-materialized from Engram #404 with exploration-rev-3 corrections (router chain landed).

## Intent

`tako doctor` prints a plain-text report of ALL five tools; the TUI `/doctor` route renders a `<Text>doctor</Text>` stub. Two halves of one diagnostic, neither surfacing what matters: what is MISSING. This change delivers ONE shared Ink screen — `tako doctor` standalone (with exit codes) and TUI navigation — reporting only missing tools.

## Scope

### In Scope

- New FSD slice `src/tui/features/doctor/{index.ts, lib/run.ts, model/useDoctorCheck.ts, ui/DoctorScreen.tsx}` (mirrors `add-remote-wizard`)
- Fill stub `src/tui/pages/doctor/ui/DoctorPage.tsx` → `DoctorScreen` (route wiring complete; zero route work)
- Rewire `src/cli/commands/doctor.ts` via slice public API; `allPresent` → exit 0/1
- Lazy doctor import in `src/cli/index.ts` (keeps Ink out of non-TUI CLI)
- Missing-only view-model (pure projection over `SystemCheckResult`); all-present → "all requirements satisfied"
- Delete `src/cli/commands/doctor-report.ts` + test
- Two eslint edits: widen cli→tui `except` + FSD 4-2 zone for `features/doctor`; update `src/index.tsx` header + ADR-0014 §4 wording (public API `index.js`, not `run.ts`)
- Delta spec `host-dependency-check`: 3 → 5 tools

### Out of Scope

- Credential/connectivity checks (decision 2: tooling only)
- Non-TTY fallback — `tako doctor | cat` keeps Ink sequences (decision 3: deferred)
- Auto-install/fix, `--json`, remote pre-flight
- Generalized command→screen deeplink convention (own ADR later)
- Domain changes — `src/domains/system/**` is final

## Capabilities

### New Capabilities

None

### Modified Capabilities

- `host-dependency-check`: Required Tools Enumeration 3→5 (`ssh`, `ssl`, `git`, `docker`, `docker-compose`); Report Output Format → missing-only shared screen; ADDED dual-invocation requirement (same screen CLI/TUI; exit codes on standalone path)

## Approach

Exploration approach 1 (ADR-0014 mirror): CLI composes `LocalHostToolChecker` + `CheckHostDependencies`, delegates to feature `lib/run.ts` (`render(<DoctorScreen/>) → Promise<SystemCheckResult>`, resolve-once + unmount), maps `allPresent` → exit code — the `runAddRemoteWizard` precedent, imported via the slice's `index.ts`. TUI: existing route shim renders the filled page → same screen.

## Affected Areas

| Area                                           | Impact   | Description                                       |
| ---------------------------------------------- | -------- | ------------------------------------------------- |
| `src/tui/features/doctor/`                     | New      | FSD slice: run contract, hook, screen, public API |
| `src/tui/pages/doctor/ui/DoctorPage.tsx`       | Modified | Stub → DoctorScreen                               |
| `src/cli/commands/doctor.ts`                   | Modified | Delegate to shared entry                          |
| `src/cli/index.ts`                             | Modified | Lazy doctor import                                |
| `src/cli/commands/doctor-report.ts` (+test)    | Removed  | All-tools formatter superseded                    |
| `eslint.config.js`, `src/index.tsx`, ADR-0014  | Modified | Zone edits + wording drift                        |
| `openspec/specs/host-dependency-check/spec.md` | Modified | Delta 3→5 + missing-only + dual invocation        |

## Risks

| Risk                                                                     | Likelihood | Mitigation                                                 |
| ------------------------------------------------------------------------ | ---------- | ---------------------------------------------------------- |
| `main`↔`origin/main` divergence (26 ahead/1 behind) blocks clean PR base | High       | User resolves landing (merge or PR chain) BEFORE doctor PR |
| Spec/impl contradiction (3 vs 5 tools) fails verify                      | Medium     | Delta MUST restate 5-tool reality                          |
| `origin/feat/tako-doctor` name collision (obsolete impl)                 | Medium     | Delete/rename remote branch before pushing                 |
| Piped stdout carries Ink escapes                                         | Accepted   | Deferred (decision 3)                                      |
| Ink final-frame persistence under Bun (design D5)                        | Low        | Bounded keypress-wait fallback in apply                    |

## Rollback Plan

Additive except two CLI rewires and one deletion; no host state touched. `git revert` restores the plain-text formatter.

## Dependencies

- Router chain (`tui-router-zustand`) LANDED on local `main` (`626f466`). Remaining gate: publish decision (origin divergence).
- Locked decisions: (1) after router — satisfied; (2) tooling only; (3) TTY fallback deferred.

## Success Criteria

- [ ] `tako doctor` and TUI `/doctor` render the SAME screen
- [ ] Only missing tools listed; all-present → satisfied state
- [ ] Exit 0 all present / 1 any missing (standalone)
- [ ] No static Ink import in the doctor CLI path
- [ ] Spec matches implementation (5 tools); test/typecheck/lint pass
- [ ] ~250–350 changed lines — fits 800-line budget, single delivery
