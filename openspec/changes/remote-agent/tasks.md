# Tasks: remote-agent — persistent agent on managed servers

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2 800–3 400 (authored) |
| 400-line budget risk | High (mitigated by chained PRs) |
| Chained PRs recommended | Yes |
| Suggested split | 9 chained PRs, one per work unit |
| Delivery strategy | chained-pr (maintainer decision 2026-09-17) |
| Chain strategy | feature-branch-chain: tracker branch `feature/remote-agent`; PR 1 → tracker, PR n → PR n-1 |

Decision needed before apply: **Resolved** — maintainer chose chained PRs (feature-branch-chain) on 2026-09-17; no size:exception needed.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | ADRs + CI workflow + docs delta | PR 1 | `bun run test` | N/A (docs/decision layer) | Delete docs/decisions/0015…17, workflows; revert AGENTS.md/docs |
| 2 | Remotes infrastructure — channels + exec/SFTP ports | PR 2 | `bun run test` | `bun run dev` (CLI smoke) | Revert SshConnectionManager additions; no other domain affected |
| 3 | Agent domain — protocol, job/run model, schedule, use cases | PR 3 | `bun run test` (unit: protocol codec, cron, state machine) | N/A (pure domain) | Delete src/domains/agent/; no other domain affected |
| 4 | Agent infrastructure — SQLite store, socket server, transport adapter | PR 4 | `bun run test` (unit: SqliteJobStore, StreamLocalAgentTransport) | N/A (infrastructure layer) | Delete agent/infrastructure/; no domain code affected |
| 5 | Docker domain — lifecycle + prune with scope guard | PR 5 | `bun run test` | N/A (pure domain + CLI adapter) | Delete src/domains/docker/; JobHandler in agent-run.ts still compiles as stub |
| 6 | Provisioning — install, uninstall, status CLI commands | PR 6 | `bun run test` (unit: provisioner decision table, linger logic) | `bun run dev` (CLI smoke) | Revert agent-install/uninstall/status.ts; agent domain still compiles |
| 7 | Job engine — scheduler loop + JobHandler wiring in agent-run.ts | PR 7 | `bun run test` (unit: missed-once catch-up, scheduler tick) | `bun run dev` (agent run — needs systemd; manual verify) | Revert agent-run.ts; sqlite migrations still run on next start |
| 8 | TUI tasks — routes, features, pages, entities, store | PR 8 | `bun run test` (unit: store actions, form model) | `bun run start` (TUI smoke, needs active remote) | Revert src/tui/{routes,pages,features,entities}/tasks/; menu shell unchanged |
| 9 | ESLint zones + package.json version bump + route regeneration | PR 9 | `bun run lint && bun run typecheck` | N/A (meta) | Revert eslint config, package.json, routes.generated.ts |

## Phase 1: ADRs + Release Workflow (docs/decisions + .github/workflows)

- [x] 1.1 Write `docs/decisions/0015-agent-command-family.md` from ADR-0015 draft (`design.md` §Architecture Decisions, D2) — agent family contract deviation, import zones, cli→tui no-exception rule
- [x] 1.2 Write `docs/decisions/0016-bun-sqlite-agent-mode.md` from ADR-0016 draft — bun:sqlite lazy-import exception scoped to `agent/infrastructure/persistence/`
- [x] 1.3 Write `docs/decisions/0017-release-trigger-resolution.md` from ADR-0017 draft — tag-push-only release, per-arch assets, supersedes AGENTS.md §5
- [x] 1.4 Modify `.github/workflows/release.yml` — replace merge-to-main auto-release with tag-push `v*` trigger (ADR-0017), x64 + arm64 matrix build, sha256 sidecars, attach all assets (workflow already exists from commit 6b33a7e)
- [x] 1.5 Verify `.github/workflows/ci.yml` — already exists (test/lint/typecheck/build x64 + version-bump gate) and matches design; change only if gaps found
- [x] 1.6 Modify `docs/distribution.md` — add arm64 target row, drop `-modern` suffix note, update release trigger to tag-push
- [x] 1.7 Modify `AGENTS.md` §5 — merge to main = CI only; tag `v*` = release; align with ADR-0017
- [x] 1.8 Modify `docs/commands.md` — add `tako agent <run|install|uninstall|status>` entry (10 commands total, per ADR-0015)
- [x] 1.9 Bump `package.json` version (patch) — CI version-bump gate requires every PR to bump

## Phase 2: Remotes Infrastructure — Channel Ports + Adapters

- [ ] 2.1 Create `src/domains/remotes/application/RemoteCommandRunner.ts` port (stdout/stderr/exit, design §Domain Architecture)
- [ ] 2.2 Create `src/domains/remotes/application/RemoteFileTransfer.ts` port (upload + download, checksum-verified)
- [ ] 2.3 Create `src/domains/remotes/application/AgentChannel.ts` port (framed duplex stream, design §Domain Architecture)
- [ ] 2.4 Create `src/domains/remotes/infrastructure/SshConnectionManager.ts` — one ssh2 Client per host; factory for exec/sftp/streamLocal channels; concurrent in-flight ops
- [ ] 2.5 Create `src/domains/remotes/infrastructure/SshRemoteCommandRunner.ts` — implements `RemoteCommandRunner` over ssh2 Client.exec
- [ ] 2.6 Create `src/domains/remotes/infrastructure/SftpRemoteFileTransfer.ts` — implements `RemoteFileTransfer` via sftp; sha256 verify
- [ ] 2.7 Create `src/domains/remotes/infrastructure/StreamLocalAgentChannel.ts` — implements `AgentChannel` via `openssh_forwardOutStreamLocal`; LDJSON codec
- [ ] 2.8 Add unit tests for SshConnectionManager concurrent channel handling (`*.test.ts`)
- [ ] 2.9 RED test: hostile job ID metacharacters rejected at domain guard (`Slug` charset) — `agent-jobs#Safe-Prune-Jobs`

## Phase 3: Agent Domain — Core Types, Protocol, Schedule, Run, Use Cases

- [ ] 3.1 Create `src/domains/agent/domain/types.ts` — Slug, Schedule, JobDefinition union (stack-lifecycle/prune/server-config), JobView, RunView
- [ ] 3.2 Create `src/domains/agent/domain/job.ts` — taxonomy guards; idempotency check by `id`
- [ ] 3.3 Create `src/domains/agent/domain/schedule.ts` — pure-TS 5-field cron matcher (`matches`, `nextAfter`); unit test coverage
- [ ] 3.4 Create `src/domains/agent/domain/run.ts` — run state machine: pending→running→succeeded|failed|unsupported; illegal-transition guard
- [ ] 3.5 Create `src/domains/agent/domain/protocol.ts` — `AgentFrame`, `PROTOCOL_VERSION = 1`, frame kinds, codec (`encodeFrame`/`decodeFrame`), handshake types
- [ ] 3.6 Create `src/domains/agent/application/AgentTransport.ts` port (client side, design §Domain Architecture)
- [ ] 3.7 Create `src/domains/agent/application/JobStore.ts` port
- [ ] 3.8 Create `src/domains/agent/application/Clock.ts` port
- [ ] 3.9 Create `src/domains/agent/application/JobHandler.ts` port (server side — maps job type → docker use cases)
- [ ] 3.10 Create `src/domains/agent/application/use-cases/` — InstallAgent · UninstallAgent · GetAgentStatus · ConnectAgent · ListJobs · UpsertJob · DeleteJob · TriggerJob · GetJobHistory · ReconcileState (10 total)
- [ ] 3.11 Unit tests: protocol codec roundtrip, frame validation, unknown frame types; cron matches/nextAfter; missed-once decision (3 missed → 1 run, watermark advance); state-machine illegal transitions; jobs.upsert idempotency (duplicate nas-prune); linger decision (pre-existing vs Tako-enabled); uname-m→asset mapping
- [ ] 3.12 RED test: remote shell metacharacters in job IDs/paths reach exec — domain guard rejects `;`, `$()`, quotes (`agent-jobs#Remote-shell-construction`)
- [ ] 3.13 RED test: pre-existing `~/.tako/tako` non-Tako file — HybridBinaryProvisioner refuses to overwrite if sha256 mismatches (`agent-jobs#Executable-placement`)
- [ ] 3.14 RED test: polkit linger denial — SystemdRemoteController surfaces actionable error (`remote-agent-install#polkit-denial`)
- [ ] 3.15 RED test: corrupted Releases asset / missing sha256 — HybridBinaryProvisioner fails explicitly (`remote-agent-install#Releases-download-fallback`)

## Phase 4: Agent Infrastructure — SQLite Store, Socket Server, Transport, Provisioner, Probe

- [ ] 4.1 Create `src/domains/agent/infrastructure/persistence/migrations.ts` — ordered MIGRATIONS: { version, sql }[]; schema_version tracking
- [ ] 4.2 Create `src/domains/agent/infrastructure/persistence/SqliteJobStore.ts` — bun:sqlite, lazy import; crash-recovery: load pending/running runs → mark stale running as failed; spec_json re-validated on load
- [ ] 4.3 Create `src/domains/agent/infrastructure/UnixSocketAgentServer.ts` — node:net server; serves protocol; crash-recovery pre-serve
- [ ] 4.4 Create `src/domains/agent/infrastructure/StreamLocalAgentTransport.ts` — client-side Transport impl via streamLocal channel
- [ ] 4.5 Create `src/domains/agent/infrastructure/SystemdRemoteController.ts` — unit file template, daemon-reload, enable/disable, linger check/enable/disable; KillUserProcesses detection
- [ ] 4.6 Create `src/domains/agent/infrastructure/HybridBinaryProvisioner.ts` — arch match: SFTP copy + sha256; mismatch: curl Releases asset + .sha256 verify; atomic mv + chmod 700; pre-existing non-empty file refusal
- [ ] 4.7 Create `src/domains/agent/infrastructure/SurviveDisconnectProber.ts` — connection A install steps → fully close A → wait 2 s → poll 3×1 s → connection B: systemctl is-active + protocol handshake; failure collects diagnostics
- [ ] 4.8 Unit tests: SqliteJobStore CRUD + restart persistence; HybridBinaryProvisioner decision table; SurviveDisconnectProber failure path
- [ ] 4.9 Integration tests: SqliteJobStore restart + migration (testcontainers, 60 s timeout)

## Phase 5: Docker Domain — Lifecycle + Safe Prune

- [ ] 5.1 Create `src/domains/docker/domain/types.ts` — PruneScopes closed union ('stopped-containers' | 'dangling-images' | 'build-cache')
- [ ] 5.2 Create `src/domains/docker/domain/prune-policy.ts` — scope validator; rejects volume prune / image prune -af structurally (ADR-0008)
- [ ] 5.3 Create `src/domains/docker/application/RunStackLifecycle.ts` — op: up/down/pull/restart; dry-run supported
- [ ] 5.4 Create `src/domains/docker/application/RunPrune.ts` — dry-run plan / apply; shared scope validator; result report shape
- [ ] 5.5 Create `src/domains/docker/infrastructure/ComposeCliAdapter.ts` — spawn docker compose … up/down/pull/restart; argv no shell
- [ ] 5.6 Create `src/domains/docker/infrastructure/DockerodePruneAdapter.ts` — scoped prune; filtered flags make -af unrepresentable
- [ ] 5.7 Unit tests: prune scope guard rejects volume/-af; compose lifecycle op assembler; dry-run report shape
- [ ] 5.8 Integration tests: docker jobs against docker:dind sidecar (compose lifecycle, scoped prune, dry-run report; 60 s timeout)

## Phase 6: Provisioning — CLI Commands (install, uninstall, status, agent-run composition root)

- [ ] 6.1 Create `src/cli/commands/agent-run.ts` — agent-mode composition root: DB open (migrations), socket server, scheduler tick (30 s), JobHandler wiring (maps job type → docker use cases); never imports Ink; lazy import for runCli
- [ ] 6.2 Modify `src/cli/index.ts` — register `agent` family (lazy imports, no Ink); add `agent run | install | uninstall | status`
- [ ] 6.3 Create `src/cli/commands/agent-install.ts` — pre-flight (arch, systemd, KillUserProcesses, linger state) → HybridBinaryProvisioner → SystemdRemoteController → SurviveDisconnectProber; plain console output
- [ ] 6.4 Create `src/cli/commands/agent-uninstall.ts` — read linger_by_tako via agent transport first → stop/disable unit → daemon-reload → disable linger iff by-tako → rm -rf ~/.tako/ → verify on second connection
- [ ] 6.5 Create `src/cli/commands/agent-status.ts` — text table: unit state, linger (+by-tako), agent/client version+protocol, jobs count, socket handshake result
- [ ] 6.6 Unit tests: provisioner decision table (arch match/mismatch/fallback-fail); uninstall ordering logic (linger-by-tako read-first); KillUserProcesses detection path; polkit denial error message
- [ ] 6.7 Integration tests: full install → probe → uninstall against privileged systemd+sshd container (jrei/systemd-ubuntu; testcontainers, 60 s timeout): copy path, probe pass, KillUserProcesses detection, residue checks

## Phase 7: Job Engine — Scheduler Loop + ExecuteRun

- [ ] 7.1 Create `src/domains/agent/application/RunSchedulerLoop.ts` — 30 s tick; missed-once catch-up: if nextAfter(watermark) ≤ now → enqueue exactly one run (catchup: true if >1 firing missed) → advance watermark; last_fire_enqueued guard prevents double-enqueue
- [ ] 7.2 Create `src/domains/agent/application/ExecuteRun.ts` — execute job: dry-run (report) or apply (mutate); call JobHandler; record run result; advance watermark
- [ ] 7.3 Wire `RunSchedulerLoop` + `ExecuteRun` into `agent-run.ts` composition root; serial execution (one run at a time)
- [ ] 7.4 Unit tests: missed-once decision (3 missed → 1 run, watermark advances once); scheduler tick fire/no-fire logic; last_fire_enqueued crash guard; serial execution guard

## Phase 8: TUI Tasks — Routes, Features, Pages, Entities, Store

- [ ] 8.1 Create `src/tui/app/routes/tasks.tsx` — route shim / composition root: SshConnectionManager → StreamLocalAgentChannel → agent use cases; reads activeRemote from useAppRuntime; never imports app/
- [ ] 8.2 Run `bun run generate:routes` — regenerate `src/tui/app/routes.generated.ts` to include /tasks
- [ ] 8.3 Create `src/tui/features/tasks/job-list/model/tasks-store.ts` — Zustand store: status (idle|connecting|ready|warning|error), agent info, jobs[], selectedJobId, historyByJob, lastSeq; connect/refresh/upsert/remove/trigger/loadHistory actions; push event handlers
- [ ] 8.4 Create `src/tui/features/tasks/job-list/ui/` — job list slice (mirrors add-remote-wizard pattern)
- [ ] 8.5 Create `src/tui/features/tasks/job-form/model/` — form model (type, target stack, schedule)
- [ ] 8.6 Create `src/tui/features/tasks/job-form/ui/` — create/edit job form slice
- [ ] 8.7 Create `src/tui/features/tasks/job-history/model/` — history query model
- [ ] 8.8 Create `src/tui/features/tasks/job-history/ui/` — history slice
- [ ] 8.9 Create `src/tui/features/tasks/dry-run-preview/model/` — dry-run report model
- [ ] 8.10 Create `src/tui/features/tasks/dry-run-preview/ui/` — dry-run preview slice + explicit Apply action
- [ ] 8.11 Create `src/tui/pages/tasks/` — TasksPage (job list + detail pane layout; install-hint when not_installed)
- [ ] 8.12 Create `src/tui/entities/job/` — JobRow view component (type from agent/domain)
- [ ] 8.13 Modify `src/tui/widgets/menu` — add /tasks entry when remote is active
- [ ] 8.14 Unit tests: tasks-store actions (connect, refresh, upsert, remove, trigger, loadHistory); form model validation; push event → store update
- [ ] 8.15 E2E (gated, `TAKO_E2E_ARM64=1`): arm64 runner — install on systemd container → schedule job → kill client → job fires → reconnect → reconcile shows run (`agent-jobs#Disconnected-execution`, `agent-jobs#Reconcile-on-connect`)
- [ ] 8.16 E2E (gated, releases-fallback only): download-fallback e2e against a published release (env-pinned version; only after first arm64 release exists) (`remote-agent-install#arch-mismatch-falls-back-to-Releases`)

## Phase 9: Meta — ESLint Zones, Version Bump, Final Verification

- [ ] 9.1 Modify `eslint.config.js` — add zones: type-only `domains/agent → domains/remotes/application`; keep tui↔cli rules per ADR-0014
- [ ] 9.2 Bump `package.json` version field (minor bump; CI rejects PRs without bump)
- [ ] 9.3 Run `bun run typecheck && bun run lint` — verify no type errors or lint violations introduced by new zones
- [ ] 9.4 Run `bun run test` — full unit test suite passes
- [ ] 9.5 Update `docs/decisions/README.md` ADR index — add entries for 0015, 0016, 0017 (index currently ends at 0014; found by WU1 verification)
