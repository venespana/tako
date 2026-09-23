# Design: remote-agent — persistent agent on managed servers

## Technical Approach

Same compiled Bun binary runs in `agent` mode on the server (`tako agent run`, a `systemd --user` unit + linger) and reaches full job autonomy: durable `bun:sqlite` queue, cron scheduler, missed-once catch-up, reconcile-on-connect. The client talks to the agent through one **UNIX-socket channel forwarded over the existing SSH connection** (`ssh2` `openssh_forwardOutStreamLocal` → `~/.tako/agent.sock`), carrying **line-delimited JSON frames** (requests/responses/push events). Install copies the client's own binary (sha256-verified), falls back to per-arch GitHub Releases assets on arch mismatch, and reports success **only after an empirical survive-disconnect probe on a second SSH connection**. Maps to specs: `remote-agent-install`, `agent-transport`, `agent-jobs`, `tui-tasks`, `remote-connection-management` (delta).

## Architecture Decisions

| # | Decision | Options & tradeoffs | Choice (rationale) |
|---|----------|---------------------|--------------------|
| D1 | Agent channel medium | (a) streamLocal forward to agent's unix socket — no extra remote deps, persistent daemon, push events; (b) exec `agent run --stdio` — spawns 2nd agent process (lock conflict); (c) per-request exec of `agent ctl` — no push events, breaks spec | **(a)** `openssh_forwardOutStreamLocal` (verified in ssh2 docs; OpenSSH ≥ 6.7 supports `direct-streamlocal`). Socket `0600`, owned by the user → SSH identity IS the auth (spec: no extra credential). |
| D2 | Command family surface | minimal vs `status`/`upgrade` commands | `tako agent run | install | uninstall | status`. **No separate `upgrade`**: `install` is idempotent and doubles as explicit upgrade (re-copy → restart → re-probe); handshake mismatch tells the user to re-run install. Keeps the closed-contract deviation (ADR-0015) as small as possible. |
| D3 | Queue/scheduler backend | (a) hand-rolled `bun:sqlite` store; (b) `node:sqlite` (Node 22 only); (c) JSON file; (d) **bunqueue** — BullMQ-compatible, Bun-native, embedded SQLite (`{ embedded: true, dataPath: '~/.tako/agent.db' }`), cron schedulers persisted across restarts | **(d) bunqueue** (maintainer decision 2026-09-18, review feedback: do not hand-build queue management). `JobStore` port unchanged; WU4 ships `BunqueueJobStore` as a lazy-imported adapter; a thin `bun:sqlite` table keeps `agent_meta` (linger/version). ADR-0016 amendment scope extended to bunqueue. Open question for WU4: verify bunqueue's missed-cron-fire semantics — if it re-fires missed occurrences more than once, `decideCatchUp`/watermark stays on top (spec: missed jobs run ONCE). **Amendment (2026-09-18, maintainer decision, task 9.8):** the WU4 verification showed bunqueue schedulers are firing machinery Tako cannot consume without double-firing against the watermark tick — so the store **never arms schedulers**: `RunSchedulerLoop`'s watermark tick is the sole firing authority and bunqueue is **durable storage only** (its spawned queue rows were unconsumed dead weight, ~8.8k/yr per hourly job). `BunqueueJobStore.open()` disarms schedulers persisted by pre-9.8 databases. The missed-once verification remains the rationale for the watermark protocol (D3 safety net). |
| D4 | Cross-domain wiring | (a) agent imports remotes/docker directly; (b) agent declares own duplicated ports; (c) **agent consumes other domains' application ports type-only; runtime wiring in cli/tui composition roots** | **(c)** zero new runtime coupling; matches existing route-shim composition pattern (`routes/remotes/add.tsx`). Recorded in ADR-0015 + new ESLint zones. |
| D5 | Docker access from agent | dockerode everywhere vs compose CLI for lifecycle + dockerode for prune | Hybrid: **ComposeCliAdapter** (spawn `docker compose … up - down pull restart`) — compose v2 is CLI-only; **DockerodePruneAdapter** for scoped prune (filters make `-af` unrepresentable). Prune scopes are a **closed union in `docker/domain`** — rejection is structural, not UI-dependent (spec). |
| D6 | Scheduler | cron lib vs pure-TS cron in domain | Pure-TS 5-field cron matcher (`*`, `*/n`, lists, ranges) in `agent/domain/schedule.ts` — no new dep, Node-20-safe, unit-testable. Schedules interpreted in **server local time** (documented). |
| D7 | Release trigger | ADR-0006 (tag push) vs AGENTS.md (auto on merge) | **Tag push wins** (ADR-0017): deliberate releases, trivial rollback, matches distribution docs; AGENTS.md §5 amended: merge to main = CI only; tag `v*` = release. |
| D8 | Linger tracking location | client conf vs server-side agent_meta | **Server-side** (`agent_meta` table): uninstall may run from any client machine; the server is the only authoritative witness of pre-existing linger. |

## Data Flow

    TUI /tasks ── agent use cases ── AgentTransport port
                        │ (import type only)
        cli/tui composition root injects ── remotes/application ports
                        │                        (RemoteCommandRunner ·
                        │                         RemoteFileTransfer · AgentChannel)
                        │ implemented by remotes/infrastructure
                 SshConnectionManager (one ssh2 Client per host)
                        │  exec · sftp · openssh_forwardOutStreamLocal
                        ▼
        ~remote: ~/.tako/agent.sock (0600) ── UnixSocketAgentServer
                        │ LDJSON frames (protocol in agent/domain)
                        ▼
        JobEngine (queue + scheduler + catch-up) ── SqliteJobStore (~/.tako/agent.db)
                        │ JobHandler port (impl wired in cli/agent-run composition)
                        ▼
        docker use cases ── ComposeCliAdapter / DockerodePruneAdapter ── docker

Install/probe path: `InstallAgent` use case drives steps over `RemoteCommandRunner`/`RemoteFileTransfer` on connection A → A closes → second connection B runs `SurviveDisconnectProber`.

## Agent Subcommands (exact surface)

| Command | Side | Behavior |
|---|---|---|
| `tako agent run` | server | Daemon started by the systemd unit. Binds socket, opens DB (runs migrations), loads jobs, scheduler tick 30 s, serves protocol. `--socket-path` override. **Never imports Ink** — enters via `runCli()` lazy import; agent domain code imports nothing from `src/tui/`. |
| `tako agent install <remote>` | client | Pre-flight (arch, systemd, KillUserProcesses, linger state) → distribute binary → unit + linger → start → **probe**. Idempotent; on existing install = upgrade (stop → replace → start → probe). Plain console output (no Ink, no new cli→tui exception). |
| `tako agent uninstall <remote>` | client | Reverse of install; linger disabled only if `linger_enabled_by_tako=1`; residue verified on a second connection. |
| `tako agent status <remote>` | client | Text table: unit state, linger (+by-tako), agent/client version + protocol, jobs count, socket handshake result. |

## Protocol (agent/domain/protocol.ts)

Framing: newline-delimited UTF-8 JSON, one frame per line; max frame 1 MiB (protocol error beyond). Protocol major version `PROTOCOL_VERSION = 1` in every frame's `v`.

```ts
interface AgentFrame<P = unknown> {
  v: 1;                                  // protocol major
  id?: string;                           // correlation: 'c<n>' client / 'a<n>' agent
  kind: 'hello' | 'hello_ack' | 'request' | 'response' | 'event' | 'error';
  type: string;                          // dotted message name, table below
  payload?: P;
}
```

- **Handshake** (first two frames on every channel): `hello` `{ clientVersion, protocol, caps: ['jobs'] }` → `hello_ack` `{ agentVersion, protocol, agentStartId }`. Same protocol major + same version → silent. Mismatch (either) → agent pushes `event: protocol.warning` `{ clientVersion, agentVersion, detail }` and **continues** — never blocks, never auto-upgrades (spec).
- **Errors**: `error` frame `{ code: 'unknown_type' | 'invalid_payload' | 'busy' | 'internal', message, correlation? }`; responses to a failed request reference the request `id`.
- **Keepalive**: agent tolerates idle channels; no ping in v0 (socket close = disconnect).

| request `type` | payload → response payload |
|---|---|
| `agent.status` | `{}` → `{ agentVersion, protocol, uptimeSec, jobCount, unitState, linger, lingerByTako }` |
| `jobs.list` | `{}` → `{ jobs: JobView[] }` |
| `jobs.upsert` | `JobDefinition` → `{ job: JobView, created: boolean }` (idempotent by `id`) |
| `jobs.delete` | `{ jobId }` → `{ deleted: boolean }` |
| `jobs.trigger` | `{ jobId, mode: 'dry-run' \| 'apply' }` → `{ run: RunView }` |
| `jobs.history` | `{ jobId?, sinceSeq?, limit? }` → `{ runs: RunView[], lastSeq }` |
| `reconcile.sync` | `{ lastSeq }` → `{ jobs, runs (seq > lastSeq), lastSeq }` |

Push events (no `id`): `job.state_changed` `{ jobId, runId, from, to, at }`; `run.completed` `{ jobId, runId, status, result }`; `protocol.warning`.

Versioning rule: additive fields = compatible within `v`; bump `PROTOCOL_VERSION` only on breaking frame-shape changes; mismatched major → warning + best-effort (v0 both sides are the same binary in the common case).

## Job & Run Model (agent/domain)

```ts
type Slug = string; // /^[a-z0-9][a-z0-9-]{0,63}$/ — shell-safe id, also the idempotent job ID
type Schedule = { kind: 'cron'; expr: string }; // v0 is cron-only per specs; one-shot scheduling deferred
type JobDefinition =
  | { id: Slug; type: 'stack-lifecycle'; op: 'up'|'down'|'pull'|'restart'; stackDir: string; schedule: Schedule }
  | { id: Slug; type: 'prune'; scopes: PruneScopes[]; schedule: Schedule } // PruneScopes = 'stopped-containers'|'dangling-images'|'build-cache' — closed union; volume prune / all-images unrepresentable
  | { id: Slug; type: 'server-config'; schedule: Schedule };                // stub → every run ends 'unsupported'
```

**Run state machine** (per execution; `pending → running → succeeded | failed | unsupported`, all terminal; illegal transitions rejected by `run.ts` pure guard):

    pending ──▶ running ──▶ succeeded | failed
                    └─────▶ unsupported      (server-config stub, v0)

`mode: 'dry-run' | 'apply'` is a run **property**, not a state: dry-run produces `result.report` (what would be removed / what would run) and mutates nothing; scheduled prune runs **apply** gated on the same scope validation as dry-run (ADR-0008). No retries, serial execution (one run at a time) in v0.

**Agent lifecycle (client view)**: `not_installed | installing | active | inactive_unit | unreachable | version_mismatch` — computed by `GetAgentStatus`/handshake, drives TUI badges.

**Missed-once catch-up**: per-job watermark `last_scheduled_fire` in `schedule_state`. On agent start and each tick: if `nextAfter(watermark) <= now`, enqueue **exactly one** run (flagged `catchup: true` when >1 firing was missed), then advance watermark to the next future occurrence — never one run per missed occurrence (spec). `last_fire_enqueued` guards the enqueue/advance window: set when the firing is enqueued, cleared once the watermark advances, so a crash in between cannot double-enqueue.

**Reconcile-on-connect**: cursor = max `runs.seq` (monotonic AUTOINCREMENT) the client has seen, persisted client-side per remote (`conf`). On connect: `reconcile.sync { lastSeq }` → agent returns full job list + all runs newer than the cursor → then live push events. Sequence numbers, not timestamps → immune to clock skew.

## SQLite Schema (bun:sqlite, `~/.tako/agent.db`)

> **Amendment (2026-09-18, maintainer decision):** job/scheduler/run persistence is delegated to **bunqueue** (embedded mode, its own SQLite schema at the same `dataPath`). The tables below remain the reference for what *Tako* owns directly: `agent_meta` (linger tracking, installed version) is kept as-is; `jobs`/`schedule_state`/`runs` shrink to a thin runs-mirror ONLY if bunqueue's history API proves insufficient for reconcile/history (WU4 verifies; decideCatchUp watermark stays on top of bunqueue either way if its missed-fire semantics differ from run-once).

```sql
PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;
CREATE TABLE schema_version (version INTEGER NOT NULL);
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,                 -- Slug, idempotent identity
  type TEXT NOT NULL CHECK (type IN ('stack-lifecycle','prune','server-config')),
  spec_json TEXT NOT NULL,             -- JobDefinition tail, validated by domain guards on upsert
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE schedule_state (
  job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  last_scheduled_fire TEXT,            -- catch-up watermark
  last_fire_enqueued INTEGER NOT NULL DEFAULT 0  -- crash guard: set on enqueue, cleared on watermark advance
);
CREATE TABLE runs (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,          -- reconcile cursor
  id TEXT NOT NULL UNIQUE, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('dry-run','apply')),
  status TEXT NOT NULL CHECK (status IN ('pending','running','succeeded','failed','unsupported')),
  catchup INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL, finished_at TEXT,
  result_json TEXT                                 -- outcome / dry-run report
);
CREATE TABLE agent_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- seeded keys: linger_enabled_by_tako ('0'|'1'), installed_version, installed_at
```

Migrations: ordered `MIGRATIONS: { version, sql }[]` in `infrastructure/persistence/migrations.ts`, applied in a transaction on open; `schema_version` tracks state. Restarts load pending/running runs → mark stale `running` as `failed` (crash recovery) before serving. `spec_json` is re-validated by the same domain guards on every load (restart/migration path); invalid definitions are rejected, never executed.

## Probe Mechanics (mandatory, empirical)

1. All install steps complete on connection A (unit active).
2. Client **fully closes connection A** (the session whose logout could kill the agent), waits 2 s, then polls up to 3× 1 s.
3. **Second, independent SSH connection B** verifies: `systemctl --user is-active tako-agent.service` = `active` **and** a protocol handshake over a streamLocal channel on B returns `hello_ack` with the expected `agentVersion`.
4. On failure: **never** report success; collect diagnostics over B — `systemctl --user status tako-agent.service`, `journalctl --user -u tako-agent.service -n 50 --no-pager`, linger state, detected `KillUserProcesses` value — and print them with the error. Arch-independent logic; x64 + arm64 proven by CI matrix (see Testing).

Install pre-flight details: `uname -m` → `x86_64`→x64 / `aarch64`→arm64 (else explicit failure naming arch). Non-systemd → clean refusal, zero mutations. `docker compose version` MUST answer exit 0 — the compose v2 plugin is REQUIRED (docker-compose v1 is EOL; maintainer decision 2026-09-18); refusal otherwise, zero mutations. `KillUserProcesses` read via `busctl get-property org.freedesktop.login1 … KillUserProcesses` (fallback: parse `/etc/systemd/logind.conf`; else `unknown`) — reported as warning, probe still executes (spec). Linger: `loginctl show-user "$USER" --property=Linger`; if `no` → `loginctl enable-linger` and record `linger_enabled_by_tako=1`; polkit denial (non-zero exit + stderr) → actionable error naming the polkit action and the `sudo loginctl enable-linger <user>` remedy. Distribution: arch match → SFTP upload of the running client binary (`process.execPath`) to `~/.tako/tako.new`, remote `sha256sum` compared to local, then atomic `mv` + `chmod 700`; mismatch → download the same-version per-arch Release asset on the server (`curl -fsSL`) + `.sha256` sidecar verify; both fail → explicit error naming arch and attempted paths (spec).

Unit file (fixed template, no user input interpolated): `~/.config/systemd/user/tako-agent.service`, `ExecStart=%h/.tako/tako agent run`, `Restart=on-failure`, `RestartSec=3`, `Environment=TAKO_AGENT=1`.

Uninstall (order matters): read `linger_enabled_by_tako` via the agent transport (`agent.status.lingerByTako`) **before** deleting anything; if the transport is unreachable, keep linger enabled and warn — the only-by-tako rule is never guessed → `systemctl --user disable --now tako-agent.service` → `rm` unit → `daemon-reload` → disable linger iff by-tako → `rm -rf ~/.tako/` → verify on second connection: no unit file, no `~/.tako`, linger state as expected.

## TUI Layout (FSD)

- Route shim `src/tui/app/routes/tasks.tsx` → **composition root** (mirrors `routes/remotes/add.tsx`): builds `SshConnectionManager` → `StreamLocalAgentChannel` → agent use cases → passes as props. Reads `useAppRuntime()` for `activeRemote`/`activeRemotePassword`; pages never import `app/`. Regenerate `routes.generated.ts` (`bun run generate:routes`).
- `src/tui/pages/tasks/` — `TasksPage` (layout: job list + detail pane), install-hint state when handshake says `not_installed`.
- `src/tui/features/tasks/` — slices `job-list`, `job-form` (create/edit: type, target, schedule), `job-history`, `dry-run-preview` (report render + explicit Apply); each with `model/` + `ui/`, mirroring `add-remote-wizard`.
- `src/tui/entities/job/` — `JobRow` view component (type from `agent/domain`).
- Zustand store `features/tasks/job-list/model/tasks-store.ts` (zustand is already a dependency):

```ts
interface TasksState {
  status: 'idle' | 'connecting' | 'ready' | 'warning' | 'error';
  agent?: { agentVersion: string; unitState: string; linger: boolean; lingerByTako: boolean };
  jobs: JobView[]; selectedJobId?: string;
  historyByJob: Record<string, RunView[]>; lastSeq: number;  // persisted per remote via conf
  connect(remote: string, password?: string): Promise<void>; // handshake + reconcile.sync + subscribe
  refresh/upsert/remove/trigger/loadHistory(): …;
}
```

Menu entry `/tasks` on the app shell when a remote is active; push events update store live (`job.state_changed`, `run.completed`).

## Domain Architecture & Ports

```
src/domains/agent/
├── domain/            job.ts (taxonomy + guards) · schedule.ts (cron) · run.ts (state machine)
│                      protocol.ts (frames + codec, shared client/server) · types.ts
├── application/       ports: AgentTransport.ts (client) · JobStore.ts · Clock.ts · JobHandler.ts (server)
│                      use cases: InstallAgent · UninstallAgent · GetAgentStatus · ConnectAgent
│                      ListJobs · UpsertJob · DeleteJob · TriggerJob · GetJobHistory · ReconcileState
│                      RunSchedulerLoop · ExecuteRun
└── infrastructure/    persistence/SqliteJobStore.ts + migrations.ts (bun:sqlite, lazy-imported)
                      UnixSocketAgentServer.ts (node:net) · StreamLocalAgentTransport.ts
                      SystemdRemoteController.ts · HybridBinaryProvisioner.ts · SurviveDisconnectProber.ts
```

- `remotes` delta: `application/` adds ports `RemoteCommandRunner` (stdout/stderr/exit), `RemoteFileTransfer` (upload + download, both checksum-verified; download unused by v0 flows), `AgentChannel` (framed duplex stream to the agent socket); `infrastructure/` adds `SshConnectionManager` (one `ssh2` Client per host; factory for exec/sftp/streamLocal channels — concurrent in-flight ops over one connection, spec) + adapters implementing the three ports. `Ssh2ConnectionTester` stays as-is.
- `application` **never** imports `ssh2`/`conf`/`dockerode`/`bun:sqlite` (D4: agent use cases import port **types** from `remotes/application` only; ESLint zone added).
- `docker/` (implemented from empty): `domain/types.ts` + `prune-policy.ts` (closed scope union + validation) · `application/RunStackLifecycle.ts`, `RunPrune.ts` (dry-run plan / apply share one scope validator) · `infrastructure/ComposeCliAdapter.ts` (spawn `docker compose`), `DockerodePruneAdapter.ts`.
- `JobHandler` implementations (map job type → docker use cases) live in the agent-mode composition root `src/cli/commands/agent-run.ts` (cli may import all domains) — agent domain never imports docker.

## ADR Drafts (apply writes `docs/decisions/` from these)

**ADR-0015 — `agent` command family (contract deviation; cross-domain port imports).** Status: Accepted. Context: closed 9-command contract (`docs/commands.md`); unattended jobs need a server-side daemon; ADR-0014 set the deviation precedent. Decision: add top-level family `tako agent <run|install|uninstall|status>` (one new command entry, four subcommands); `install` is idempotent and doubles as the explicit upgrade path (handshake warns, user acts — no auto-upgrade); agent subcommands use plain console output (no new cli→tui exceptions). Amendment to ADR-0010 dependency rules: a domain's `application/` ports are its public API; other domains may import them **type-only** (`import type`); runtime wiring happens in cli/tui composition roots; enforced by new `import-x/no-restricted-paths` zones. Consequences: contract count 9→10 (documented deviation); zero runtime coupling between domains; ESLint keeps it mechanical.

**ADR-0016 — Amendment to ADR-0011: `bun:sqlite` in agent-mode code.** Status: Accepted (amends 0011). Context: ADR-0011 mandates Node-20 compat ("Bun-only APIs forbidden") for the npm channel; the agent needs durable local storage and always runs as the compiled Bun binary. Decision: `bun:sqlite` is permitted **only** in `src/domains/agent/infrastructure/persistence/**` and the agent-mode composition root, reached via lazy `import()` so npm/Node client paths never load it; `tako agent run` executed under non-Bun fails at startup with an explicit message. All other code keeps the Node-20 rule. Consequences: npm channel unaffected; agent persistence is Bun-only by construction; rule is scoped, not global relaxation.

**ADR-0017 — Release trigger resolution (ADR-0006 vs AGENTS.md) + per-arch assets.** Status: Accepted (resolves contradiction; supersedes the AGENTS.md auto-release wording). Context: ADR-0006 (tag push `v*`) vs AGENTS.md §5 (auto-release on merge) contradict; install's Releases fallback needs trustworthy per-arch asset URLs. Decision: releases trigger **only on tag push `v*`**; merge to main runs CI (build+test) only; every release publishes `tako-linux-x64`, `tako-linux-arm64`, and `<asset>.sha256` sidecars; version-bump-per-PR rule unchanged; AGENTS.md §5 and `docs/distribution.md` updated accordingly. Consequences: deliberate releases, trivial rollback; tagging discipline required; arm64 Releases fallback becomes functional.

## Release Workflow (`.github/workflows/release.yml`)

```yaml
name: release
on: { push: { tags: ['v*'] } }        # ADR-0017 resolution
jobs:
  release:
    runs-on: ubuntu-latest
    strategy: { matrix: { include: [
      { target: bun-linux-x64-modern, asset: tako-linux-x64 },
      { target: bun-linux-arm64,      asset: tako-linux-arm64 } ] } }
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run prebuild && bun run typecheck && bun run lint && bun run test
      - run: bun build src/index.tsx --compile --target=${{ matrix.target }} --outfile dist/${{ matrix.asset }}
      - run: sha256sum dist/${{ matrix.asset }} > dist/${{ matrix.asset }}.sha256
      - uses: softprops/action-gh-release@v2   # attaches dist/* (binaries + .sha256)
```

Companion CI already exists (`.github/workflows/ci.yml`: push/PR test/lint/typecheck/build x64 + version-bump gate, added in commit 6b33a7e) and matches this design; no changes required. The existing `release.yml` implements merge-to-main auto-release and MUST be converted to the ADR-0017 tag-push model. `docs/distribution.md` gains the arm64 target row (and drops the `-modern` suffix note: it's a compat alias).

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/cli/index.ts` | Modify | Register `agent` family (lazy imports, no Ink) |
| `src/cli/commands/agent-run.ts` | Create | Agent-mode composition root: DB, socket server, scheduler, JobHandler wiring |
| `src/cli/commands/agent-install.ts` / `agent-uninstall.ts` / `agent-status.ts` | Create | Thin handlers → agent use cases |
| `src/domains/agent/**` (tree above) | Create | Domain, application (ports + 12 use cases), infrastructure |
| `src/domains/remotes/application/{RemoteCommandRunner,RemoteFileTransfer,AgentChannel}.ts` | Create | Channel ports (delta spec) |
| `src/domains/remotes/infrastructure/{SshConnectionManager,SshRemoteCommandRunner,SftpRemoteFileTransfer,StreamLocalAgentChannel}.ts` | Create | Sole ssh2 consumers for channels; concurrent channels per connection |
| `src/domains/docker/{domain,application,infrastructure}/**` | Create | Implement empty domain: lifecycle + safe prune |
| `src/tui/app/routes/tasks.tsx` | Create | Route shim / composition root |
| `src/tui/app/routes.generated.ts` | Modify | Regenerated |
| `src/tui/pages/tasks/**`, `src/tui/features/tasks/**`, `src/tui/entities/job/**` | Create | Tasks UI (FSD slices + zustand store) |
| `src/tui/widgets/menu` | Modify | `/tasks` entry when remote active |
| `.github/workflows/release.yml` | Modify | Convert merge-to-main auto-release to tag-push `v*` + per-arch matrix + sha256 sidecars (ADR-0017); `ci.yml` already exists and matches |
| `eslint.config.js` | Modify | Zones: type-only `domains/agent → domains/remotes/application`; keep tui↔cli rules |
| `docs/commands.md`, `docs/distribution.md`, `AGENTS.md` | Modify | `agent` family; arm64 + tag trigger; §5 release wording |
| `docs/decisions/0015…0017…md` | Create | From ADR drafts above |

No deletions. Version bump (minor) per repo rule.

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit (co-located `*.test.ts`) | Protocol codec roundtrip, frame validation, unknown types; cron `matches`/`nextAfter`; missed-once decision (3 missed → 1 run, watermark advance); run state-machine illegal transitions; `jobs.upsert` idempotency (duplicate `nas-prune`); prune guard rejects volume/`-af`; linger decision (pre-existing vs Tako-enabled); `uname -m`→asset mapping; uninstall ordering logic | Pure functions + in-memory fakes; existing patterns (`*.test.ts` next to source) |
| Integration (`tests/integration/*.integ.test.ts`, 60 s, testcontainers) | Full install → probe → uninstall against a **privileged systemd+sshd container** (e.g. `jrei/systemd-ubuntu`): copy path, probe pass, KillUserProcesses detection, residue checks; docker jobs against a `docker:dind` sidecar (compose lifecycle, scoped prune, dry-run report); `SqliteJobStore` restart persistence + migration; streamLocal transport against a real sshd container | New `tests/integration/agent/`, `tests/integration/docker/` |
| E2E (`tests/e2e/*.e2e.ts`, 120 s) | Compiled binary: `tako agent install` on systemd container → schedule job → kill client → job fires → reconnect → reconcile shows run; **arm64: same suite as a separate job on a native arm64 runner** (gate: `TAKO_E2E_ARM64=1`); Releases-fallback e2e only against a published release (env-pinned version) | Matrix per D7/ADR-0017; download-fallback e2e optional-gated until first arm64 release exists |

## Threat Matrix

Boundaries touched: remote shell execution, executable-file placement, systemd process integration. Standard rows that do not apply: documentation-like paths, git repository selection, commit state, push state, PR commands — **N/A** (no VCS/PR automation, no doc-like file execution).

| Boundary | Adversarial cases | Applicability | Safe/failure behavior | RED tests |
|---|---|---|---|---|
| Remote shell construction | job IDs / paths with metacharacters (`;`, `$()`, quotes) reaching `exec`/compose CLI | Applicable | `Slug` charset + `stackDir` validated in domain before any command; commands assembled as single-quoted literals; compose args passed as argv (no shell) | Unit: guard rejects `nas;reboot`, `$(x)` IDs, paths with quotes; integ: install with hostile remote name is refused pre-flight |
| Executable placement | pre-existing non-Tako file at `~/.tako/tako`; `~/.tako` symlink; partial upload | Applicable | Upload to `tako.new` + sha256 gate before atomic `mv`; refusal to overwrite a non-empty `~/.tako/tako` whose sha256 matches neither prior install nor new binary | Unit: provisioner decision table; integ: pre-planted decoy file → explicit failure, no overwrite |
| systemd unit lifecycle | unit file exists with foreign content; `daemon-reload`/`enable` failures; polkit linger denial | Applicable | Unit content is a fixed template (no user interpolation); existing unit overwritten only if `ExecStart` references `%h/.tako/tako`; every systemctl step checked, failures surface stderr + remedy | Unit: controller command sequences (fake runner); integ: polkit-denied linger → actionable message; probe failure path yields diagnostics, never success |
| Releases download fallback | corrupted asset, missing `.sha256`, no egress | Applicable | sha256 sidecar verify before `mv`; any failure → explicit error naming arch + attempted paths | Unit: asset-resolution + verify-order logic with fake downloader; e2e (gated): mismatched checksum → install fails explicitly |

## Migration / Rollout

No data migration of existing systems (agent ships new; `schema_version` migrations cover agent DB evolution from v1). Rollout follows the proposal's slice order (ADRs → release workflow → transport → provisioning → jobs → TUI); agent install is opt-in per remote; PR revert leaves an inert agent (proposal rollback plan). Client reconcile cursor defaults to `lastSeq=0` (full resync) — no client migration.

## Open Questions

- [ ] Confirm the arm64 e2e runner (native GitHub arm64 runner availability vs QEMU) — non-blocking: suite is gated by env var.
- [ ] `direct-streamlocal` support on unusual sshd builds (dropbear) — non-blocking: probe/handshake fails with an actionable error; documented requirement OpenSSH ≥ 6.7.
- [ ] Cron engine boundary: v0 supports 5-field cron without `L`/`#` specifiers — sufficient for the taxonomy; extend on demand.
