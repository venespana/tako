# Design: doctor command

## Architecture

One shared Ink screen, two entries, domain untouched (`src/domains/system/**` already checks 5 tools).

```
CLI  src/index.tsx ─→ cli/index.ts (lazy import)
                       └→ cli/commands/doctor.ts
                            composes LocalHostToolChecker + CheckHostDependencies
                            └→ tui/features/doctor/index.ts   (ADR-0014 exception)
                                 └→ lib/run.ts
                                      render(<DoctorScreen runCheck onComplete onError/>)
                                      → Promise<SystemCheckResult>, resolve-once + unmount
                            maps result.allPresent → exit 0 / 1

TUI  App router ─→ app/routes/doctor.tsx (existing shim, UNTOUCHED)
                    └→ pages/doctor/ui/DoctorPage.tsx
                         composes same use case
                         └→ <DoctorScreen runCheck/>   (no callbacks → static render)

Shared slice  features/doctor/
                ui/DoctorScreen.tsx        (checking / missing-only / satisfied / error states)
                model/use-doctor-check.ts  (runs check once on mount)
                model/view-model.ts        (toMissingOnly pure projection)
```

## Key Decisions

1. **DoctorScreen shared CLI/TUI**: props `{ runCheck: () => Promise<SystemCheckResult>; onComplete?; onError? }`. Presence of callbacks marks standalone mode: final frame adds "press any key to exit" (mitigates Ink final-frame persistence under Bun; bounded), then fires the callback. TUI passes only `runCheck` — static result, no exit semantics. Matches spec's Dual Invocation requirement.

2. **run.ts CLI entry**: mirrors `runAddRemoteWizard` — `resolved` guard, `unmount()` before resolve. Resolves with `SystemCheckResult`; rejects on check failure. Exported only via slice `index.ts` (FSD 4-2). Unexpected CLI errors print to stderr and exit 1 (spec defines only 0/1).

3. **useDoctorCheck hook**: `useDoctorCheck(runCheck)` runs the check once on mount, exposes `{ status: 'checking' } | { status: 'done'; result } | { status: 'error'; error }`. No zustand store — unlike the wizard there is no cross-entry persistent state to reset. Note: file named `model/use-doctor-check.ts` (kebab-case, convention of `use-add-remote-wizard.ts` / `use-menu-list.ts`; proposal's `useDoctorCheck.ts` was path shorthand — export keeps camelCase).

4. **toMissingOnly() view-model**: pure `SystemCheckResult → ToolCheckResult[]` filtering `status === 'not-found'`, order preserved. Empty + `allPresent` → "all requirements satisfied" state; present-tool versions omitted (spec MAY). No formatting logic in the screen.

5. **Delete doctor-report.ts (+test)**: all-tools formatter superseded by the screen. No other consumer (verified by grep).

6. **eslint zones + wording**: (a) widen the cli→tui zone's `except` with `src/tui/features/doctor/**` and pluralize its message; (b) add FSD 4-2 zone for `src/tui/features/doctor/**` (except `index.{ts,tsx}`) and add `src/tui/features/doctor/**/*` to the target lists of the menu and remotes 4-2 zones (sibling closure — both existing zones do this mutually). Update `src/index.tsx` header and ADR-0014 §4 wording: exceptions import the slice public API (`index.js`), not `run.ts`; wizard is no longer "the one" exception.

7. **Lazy doctor import in cli/index.ts**: drop the eager `runDoctor` import; `await import('./commands/doctor.js')` inside the action (remote-add precedent) so Ink stays out of non-TUI CLI startup.

## File Map

| File                                                  | Action | Description                                                                         |
| ----------------------------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| `src/tui/features/doctor/index.ts`                    | Create | Public API: `runDoctorScreen`, `DoctorScreen`, `RunDoctorDeps`, `DoctorScreenProps` |
| `src/tui/features/doctor/lib/run.ts`                  | Create | ADR-0014 render→Promise entry                                                       |
| `src/tui/features/doctor/model/use-doctor-check.ts`   | Create | Check-on-mount hook                                                                 |
| `src/tui/features/doctor/model/view-model.ts` (+test) | Create | `toMissingOnly` pure projection                                                     |
| `src/tui/features/doctor/ui/DoctorScreen.tsx` (+test) | Create | Shared screen, 4 states                                                             |
| `src/tui/pages/doctor/ui/DoctorPage.tsx`              | Modify | Stub → composes use case + renders `DoctorScreen`                                   |
| `src/cli/commands/doctor.ts`                          | Modify | Delegate to `runDoctorScreen`; `allPresent`→0/1                                     |
| `src/cli/index.ts`                                    | Modify | Lazy doctor import                                                                  |
| `src/cli/commands/doctor-report.ts` (+`.test.ts`)     | Delete | Superseded formatter                                                                |
| `eslint.config.js`                                    | Modify | Decision 6 zone edits                                                               |
| `src/index.tsx`, `docs/decisions/0014-*.md`           | Modify | Header/§4 wording drift                                                             |

## Testing Strategy

| Layer       | What                                                       | How                                                       |
| ----------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| Unit        | `toMissingOnly` filter/order/empty                         | vitest, pure                                              |
| Unit        | `useDoctorCheck` mount-run + error                         | vitest (colocated, like `use-menu-list`)                  |
| Component   | Screen states: checking / missing-only / satisfied / error | vitest + fake `runCheck` (AddRemoteWizard.test.tsx style) |
| Integration | `run.ts` resolve-once/unmount; `runDoctor` exit mapping    | fake check, no real binaries                              |
| E2E         | `tako doctor` exit codes                                   | manual smoke                                              |

## Threat Matrix

N/A — no new routing (route shim untouched), subprocess, shell, VCS/PR automation, executable classification, or process integration. `LocalHostToolChecker` process spawning is unchanged domain code.

## Migration / Rollout

No migration required. Additive slice + two CLI rewires + one deletion; `git revert` restores the plain formatter.

## Open Questions

- None blocking. Keypress-wait fallback shape (D5) is bounded and resolved in apply if Ink final-frame behaves.

## Ready for Tasks

**Yes** — all decisions locked, precedents verified in code, ~250–350 changed lines forecast (single PR, fits budget).
