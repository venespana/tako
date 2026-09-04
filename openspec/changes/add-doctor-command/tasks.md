# Tasks: add-doctor-command — host dependency check

## Review Workload Forecast

| Field                   | Value     |
| ----------------------- | --------- |
| Estimated changed lines | ~150–180  |
| 400-line budget risk    | Low       |
| Chained PRs recommended | No        |
| Delivery strategy       | single-pr |
| Suggested split         | Single PR |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal                | Likely PR | Focused test command | Runtime harness       | Rollback boundary                                          |
| ---- | ------------------- | --------- | -------------------- | --------------------- | ---------------------------------------------------------- |
| 1    | Full implementation | PR 1      | `bun test`           | `bun run tako doctor` | Delete `src/domains/system/`, `src/cli/commands/doctor.ts` |

## Phase 1: Domain Types (Foundation)

- [x] 1.1 Create `src/domains/system/domain/types.ts` — export `HostTool` union (`'ssh'|'git'|'docker'`), `CheckStatus` (`'found'|'not-found'`), `ToolCheckResult`, `SystemCheckResult`
- [x] 1.2 Create `src/domains/system/domain/required-tools.ts` — export `REQUIRED_HOST_TOOLS: readonly HostTool[]` as `['ssh','git','docker']`

## Phase 2: Port Interface

- [x] 2.1 Create `src/domains/system/application/HostToolChecker.ts` — export `interface HostToolChecker` with `check(tool: HostTool): Promise<ToolCheckResult>`

## Phase 3: RED Unit Tests (strict TDD — write failing tests first)

- [x] 3.1 RED: `src/domains/system/application/CheckHostDependencies.test.ts` — fake `HostToolChecker` returns all-found → assert `allPresent=true`, `results.length=3`
- [x] 3.2 RED: same file — fake returns partial missing → assert `allPresent=false`, correct `status` per tool
- [x] 3.3 RED: same file — fake returns all missing → assert `allPresent=false`
- [x] 3.4 RED: `src/domains/system/domain/required-tools.test.ts` — assert `REQUIRED_HOST_TOOLS` has exactly 3 items in `['ssh','git','docker']` order

## Phase 4: Use Case Implementation (GREEN)

- [x] 4.1 Create `src/domains/system/application/CheckHostDependencies.ts` — constructor accepts `HostToolChecker`, `checkAll(): SystemCheckResult` iterates `REQUIRED_HOST_TOOLS`, sets `allPresent` from every `status === 'found'`

## Phase 5: Adapter + Formatter

- [x] 5.1 RED: `src/domains/system/infrastructure/LocalHostToolChecker.test.ts` — stub `Bun.spawn`; assert ENOENT → `status:'not-found', version:null`; assert exit≠0 → `status:'found', version:null`; assert stdout empty + stderr has content (ssh -V) → `version` from stderr
- [x] 5.2 GREEN: `src/domains/system/infrastructure/LocalHostToolChecker.ts` — `Bun.spawn([tool, flag])` per tool; `stdout.trim()||stderr.trim()||null`; catch ENOENT → `not-found`; exit≠0 → `found+null`
- [x] 5.3 RED: `src/cli/commands/doctor-report.test.ts` — assert `formatToolLine({tool:'git',status:'found',version:'git version 2.43.0'})` → contains green marker + 'git' + version; assert missing → contains red marker + 'not found'
- [x] 5.4 GREEN: `src/cli/commands/doctor-report.ts` — `formatToolLine(result): string` using picocolors; green checkmark for `found`, red X for `not-found`

## Phase 6: CLI Handler + Integration

- [x] 6.1 Create `src/cli/commands/doctor.ts` — wire `LocalHostToolChecker` → `CheckHostDependencies` → `formatToolLine` → `console.log`; derive exit code from `allPresent` (0 or 1)
- [x] 6.2 Modify `src/cli/index.ts` — replace stub with `switch(argv[2])` routing `'doctor'` → `doctor.ts`
- [x] 6.3 GREEN (integration): `tests/integration/system/LocalHostToolChecker.test.ts` — spawn real `git --version`, assert `status:'found'` and non-null version
- [x] 6.4 Delete `src/domains/system/{domain,application,infrastructure}/.gitkeep` placeholders
