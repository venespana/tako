# MVP Completion — mvp-completion

## Objective
Complete the user-defined MVP and then cut the first release: agent installed and validated on a real machine, full container management (start/stop/restart), stack logs via CLI and per-container logs via TUI, and container health visible in TUI + CLI.

## Problem
The hub can start/restart but not stop containers (`stop` is structurally excluded from the closed op union at `src/domains/docker/domain/container-lifecycle.ts:13`), the CLI has no `logs` command despite the closed contract declaring it (`docs/commands.md:15,89-91`), and container healthcheck state is surfaced nowhere (only running/paused/exited). The agent install path is code-complete but never validated on a real host (RA-001), and no release has ever been cut.

## Why
User definition of MVP (2026-11-10): install the service on the server and manage containers (stop, restart, start, view logs, health status) before planning the first release.

## Decisions (user, 2026-11-10)
- **No release until the MVP is complete** — the tag push is the final task, not an intermediate step.
- **Health scope: TUI + CLI** — health in the hub inventory AND `tako status --containers`. Extends the closed command contract → decision record required (T3 opens with ADR-0021).
- **stop confirmation: same pattern as restart** — no extra confirmation; offered only when the container is running/paused.
- **RA-001 target: another machine meanwhile** — homeServer is offline (root SSD failed 2026-11-09, machine powered off); validation moves to an alternate SSH-reachable machine.

## Scope
T1–T5 below. Current CLI registers only `doctor`, `remote add`, `status`, and the `agent` family (`src/cli/index.ts`). Command contract: `docs/commands.md` (closed, 10 commands).

## Tasks

### [ ] T1-cli-logs — `tako logs <stack> [--host X] [-f]`
Contract (`docs/commands.md:89-91`): `docker compose logs` via SSH, `-f` to follow. Stack-level — NOT the TUI per-container path.
- New compose-log streamer reusing the `RemoteLogStream` line machinery (`src/domains/docker/infrastructure/RemoteDockerLogsAdapter.ts`) with a compose-logs command builder; the stack name passes a name gate (same discipline as `container-lifecycle.ts`).
- Use case `StreamStackLogs` (application) + port; service `streamStackLogs` (`src/services/docker.ts`).
- CLI: register `logs` in `src/cli/index.ts` (lazy import) + handler; honor `-f`; exit codes per `docs/commands.md` conventions.
- Unit tests RED→GREEN (vitest, co-located).
- Version bump 0.5.0. Branch `feature/cli-logs`. Route: delegated writer.

### [ ] T2-container-stop — `stop` in domain + hub
- Add `'stop'` to `ContainerLifecycleOp` and `CONTAINER_LIFECYCLE_OPS` (`src/domains/docker/domain/container-lifecycle.ts:13,16`). `RunContainerLifecycle` and `RemoteDockerLifecycleAdapter` are already op-generic — the union gate flows through; verify the adapter builds `docker stop <name>`.
- Hub (`src/tui/pages/remote-home/`): add the `stop` `ContainerAction`, offered only when running/paused; update `containerActionLabel` and the ACTIONS builder; wire the currently inert `s` key (`use-remote-home-actions.ts`). No extra confirmation (decision above).
- Tests: extend `RunContainerLifecycle.test.ts` + hub model tests.
- Version bump 0.6.0. Branch `feature/container-stop`. Route: delegated writer.

### [ ] T3-health-status — health in TUI + `status --containers`
- FIRST: decision record ADR-0021 extending the contract with a `--containers` flag on `tako status` (flag, not a new command; update `docs/commands.md`).
- Domain: `ContainerSnapshot` gains optional health; parse the `.Health` field of `docker ps -a --format '{{json .}}'` (verify the exact field shape against the target docker version at implementation); keep the strict-refusal parsing discipline (`container-status.ts`).
- TUI: health shown in hub inventory rows (healthy / unhealthy / starting / no check).
- CLI: `tako status --containers` prints per-container state + health.
- Version bump 0.7.0. Branch `feature/health-status`. Route: delegated writer.

### [ ] T4-ra001-real-install-validation — agent install on a real machine
- Target: another machine (homeServer offline until its new SSD). Requires the user to name the host AND give explicit remote authorization (destination, operation, credentials) before any remote action.
- Steps: `bun run build` → `tako agent install` exercising the SFTP path with sha256 → validate idempotent reinstall (upgrade path per ADR-0015), `agent status`, `agent run`, then `uninstall`.
- Record evidence and check RA-001 in `odd/tasks/remote-agent-followups.md`. No code changes.

### [ ] T5-first-release — tag and verify
- After T1–T4: push tag `v<version>` → `release.yml` publishes per-arch assets + sha256 (ADR-0017). The tag push is the user's decision (publishing).
- Then RA-002 (arm64 e2e) and RA-003 (Releases-fallback e2e) become actionable.

## Delivery strategy
`ask-on-risk` (default). Forecast: ~410 authored lines (T1 ~130, T2 ~100, T3 ~180). Crosses the ~400-line boundary during T3 → ask once for the chain strategy (stacked-to-main vs feature-branch-chain) before the commit that crosses it. Version bumps ride each task's PR (CI rejects PRs without a bump).

## Route declarations
| Task | Route | Trigger |
| --- | --- | --- |
| T1 | delegated writer | 4+ files (cli, service, use case, adapter, tests) |
| T2 | delegated writer | domain + hub + tests (2+ non-trivial files) |
| T3 | delegated writer | ADR + domain + hub + cli + tests |
| T4 | parent-coordinated (operational) | remote execution needs user authorization; no code |
| T5 | inline | mechanical bump + tag; the push is the user's |

## Acceptance criteria
- `tako logs <stack> -f` streams stack logs; without `-f` prints and exits.
- The hub offers stop only for running/paused containers and it works end-to-end.
- `tako status --containers` shows per-container state + health; hub rows show health.
- Agent install validated on a real machine with evidence recorded (RA-001 closed).
- Tag `v*` pushed by the user; CI green; release assets published.

## Applicable checks
Per task: `bun run test && bun run typecheck && bun run lint`; test-first RED→GREEN (vitest unit project, co-located `*.test.ts`). T4: operational evidence on the target machine. T5: CI + release workflow run.

## Progress
- 2026-11-10: document created; decisions recorded; no task started. Next: T1.
- 2026-11-10: **T1 implemented + verified** on `feature/cli-logs` (delegated writer, TDD RED→GREEN observed): stack-name gate + command builder (`src/domains/docker/domain/stack-logs.ts`, 20 tests), `StreamStackLogs` use case, `RemoteComposeLogsAdapter` (22 tests), `streamStackLogs` service, CLI `logs` command (10 tests incl. SIGINT path), version 0.4.1→0.5.0. Verification of record: `bun run test` 1172/1172 PASS (spot-checked by parent), `bun run typecheck` PASS, `bun run lint` PASS. Known deviation: `RemoteLogStream` line machinery duplicated into `RemoteComposeLogsAdapter` (module-private in `RemoteDockerLogsAdapter.ts`, outside the task's surfaces); extraction into a shared module is a proposed follow-up. `src/shared/lib/version.ts` (generated) still reads 0.4.1 until the next prebuild. **Work-unit commit pending user validation.** Next: T2.
