# Tasks: doctor command

## Review Workload Forecast

| Field                   | Value       |
| ----------------------- | ----------- |
| Estimated changed lines | 250–350     |
| 400-line budget risk    | Low         |
| Chained PRs recommended | No          |
| Suggested split         | Single PR   |
| Delivery strategy       | ask-on-risk |
| Chain strategy          | pending     |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal      | Likely PR | Focused test command | Runtime harness | Rollback boundary            |
| ---- | --------- | --------- | -------------------- | --------------- | ---------------------------- |
| 1    | All tasks | PR 1      | `bun run test`       | `tako doctor`   | Full revert via `git revert` |

## Phase 1: Foundation — view-model

- [x] 1.1 Create `src/tui/features/doctor/model/view-model.ts` — export `toMissingOnly(result: SystemCheckResult): ToolCheckResult[]` filtering `status === 'not-found'`, preserving order
- [x] 1.2 Create `src/tui/features/doctor/model/view-model.test.ts` — vitest: filter correctness, order preservation, empty-all-present returns [], empty-missing returns []

## Phase 2: Core — hook + screen

- [x] 2.1 Create `src/tui/features/doctor/model/use-doctor-check.ts` — export `useDoctorCheck(runCheck: () => Promise<SystemCheckResult>)` returning `{ status: 'checking' } | { status: 'done'; result } | { status: 'error'; error }`; runs on mount
- [x] 2.2 Create `src/tui/features/doctor/model/use-doctor-check.test.ts` — vitest: mount triggers check, done/error states, no zustand
- [x] 2.3 Create `src/tui/features/doctor/ui/DoctorScreen.tsx` — four states: `checking` (spinner/text), `missing-only` (list of missing tools), `satisfied` (all-good message), `error` (error message); props: `{ runCheck: () => Promise<SystemCheckResult>; onComplete?: (result) => void; onError?: (err) => void }`; standalone mode adds keypress-wait on final frame
- [x] 2.4 Create `src/tui/features/doctor/ui/DoctorScreen.test.tsx` — vitest + fake `runCheck`: test all four states rendered

## Phase 3: CLI integration — run.ts + rewiring

- [x] 3.1 Create `src/tui/features/doctor/lib/run.ts` — mirror `runAddRemoteWizard` pattern: `resolved` guard, `unmount()` before resolve, `render(<DoctorScreen runCheck onComplete onError/>) → Promise<SystemCheckResult>`; exported only via slice `index.ts`
- [x] 3.2 Create `src/tui/features/doctor/lib/run.test.ts` — vitest: resolve-once guard, unmount before resolve, exit mapping via fake check
- [x] 3.3 Create `src/tui/features/doctor/index.ts` — public API: `runDoctorScreen`, `DoctorScreen`, `RunDoctorDeps`, `DoctorScreenProps`
- [x] 3.4 Modify `src/cli/commands/doctor.ts` — remove inline check logic; import `runDoctorScreen` from slice public API; map `result.allPresent` → exit 0/1
- [x] 3.5 Modify `src/cli/index.ts` — lazy import: `await import('./commands/doctor.js')` inside the action (remote-add precedent)
- [x] 3.6 Modify `src/tui/pages/doctor/ui/DoctorPage.tsx` — replace stub; compose `useDoctorCheck` + render `<DoctorScreen runCheck/>` (no callbacks → static render)
- [x] 3.7 Delete `src/cli/commands/doctor-report.ts` and `src/cli/commands/doctor-report.test.ts` — all-tools formatter superseded

## Phase 4: Linting + hygiene

- [x] 4.1 Modify `eslint.config.js` — widen `cli→tui` zone `except` to include `src/tui/features/doctor/**`; add FSD 4-2 zone for `src/tui/features/doctor/**` (except `index.{ts,tsx}`)
- [x] 4.2 Modify `eslint.config.js` — add `src/tui/features/doctor/**/*` to target lists of existing menu and remotes 4-2 zones (sibling closure)
- [x] 4.3 Modify `src/index.tsx` header — update wording: exceptions import slice public API (`index.js`), not `run.ts`
- [x] 4.4 Modify `docs/decisions/0014-*.md` — update §4 wording: wizard no longer "the one" exception

## Phase 5: Verification

- [x] 5.1 Run `bun run test` — all new and existing tests pass
- [x] 5.2 Run `bun run typecheck` — no type errors
- [x] 5.3 Run `bun run lint` — no lint errors (only pre-existing warnings)
- [x] 5.4 Run `bun run format:check` — no formatting drift
- [ ] 5.5 Smoke: `tako doctor` — renders screen, exit 0 (all present) / 1 (any missing)
