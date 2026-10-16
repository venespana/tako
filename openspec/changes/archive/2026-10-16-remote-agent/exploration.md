# Exploration: remote-agent — persistent agent on managed servers

## Current State

- **SSH layer is test-only.** `Ssh2ConnectionTester` (sole `ssh2` consumer, infrastructure adapter) validates connections and captures hostkey fingerprints. There is no exec/SFTP channel, no multiplexing, no persistent session. Ports live in `src/domains/remotes/application/` (`SshConnectionTester`, `RemoteRepository`, `SecretVault`).
- **Docker domain is an empty shell.** `src/domains/docker/{application,infrastructure}/` contain no code. Compose operations exist only as spec in `docs/commands.md` (`install`, `status`, `logs`, `cleanup`, `rollback`). A job runner cannot reuse existing docker code — it must be built.
- **System domain**: `CheckHostDependencies` + `HostToolChecker` port check for required local tools. Pattern to copy for remote-side agent checks.
- **Bootstrap**: `src/index.tsx` — no args → Ink TUI (lazy import), args → `runCli()` (Commander, lazy command imports). An `agent` subcommand enters via CLI, so Ink never loads — clean, as required.
- **TUI**: FSD layers, react-router memory router with generated `routes.generated.ts`, `AppRuntimeContext` carries active remote. A per-server "tasks" page = new route + page + feature slice (`src/tui/features/tasks/`, `src/tui/pages/tasks/`).
- **Command contract is closed** (9 commands, `docs/commands.md`). `tako agent ...` is a new command → requires an ADR (precedent: ADR-0014 recorded the `remote add` singular deviation).
- **Relevant ADRs**: 0003 (no orchestrator — agent is execution infrastructure, not a mental-model layer), 0008 (safe prune policy — directly constrains the maintenance job taxonomy: NEVER `-af` image prune, NEVER volume prune), 0009 (multi-host ready), 0011 (distribution channels + "Bun-only APIs forbidden" Node-20 compat rule), 0013 (templates/binary embedded — precedent for embedding), 0014 (v0 secrets posture, closed-contract deviation precedent).

## External Research Summary

- **systemd user + linger** (loginctl(1), systemd 262): `loginctl enable-linger [USER]` with no argument enables lingering for the *calling* user — no root needed (polkit default allows self). Linger spawns the user manager at boot and keeps it after logout. `KillUserProcesses=yes` in `logind.conf` kills *session-scope* processes at logout but does NOT kill services running under the lingered user manager (`user@UID.service`) — running the agent as a `systemd --user` unit is the correct mitigation. Distro variation: default is `no` since systemd 230, but SUSE ships `yes` historically; detection must be explicit, and empirical verification (spawn unit → open/close an SSH session → check unit still active) is the only trustworthy proof.
- **VS Code Remote SSH**: client bootstraps server by running a shell command over SSH that detects platform/arch (`uname`), downloads or copies a versioned server bundle to `~/.vscode-server/bin/<commit>` with checksum verification, then starts it and multiplexes all protocol channels (requests, output streams, pty) over the single SSH stdio pipe with its own framing. Reconnect reuses the persisted server process; version mismatch triggers re-provisioning. Takeaway: versioned install dir + handshake + checksum + one-transport framing are the proven pattern.
- **GitHub Actions Runner / GitLab Runner**: persistent agent holds an outbound connection (or polls) to the server; jobs live in a server-side queue with an assignment/ack model; agent state survives reconnect because job results are acknowledged and reconciled on reconnect (idempotent job IDs, "last known state" sync). Runner lifecycle managed as a system service (root) or user service; GitLab supports `--user` service install non-interactively. Takeaway: durable queue on the agent host + idempotent job IDs + state reconciliation on connect is the standard reconnect semantics.

## Decision Map

### Decided (product goal — fixed)
1. Same Tako binary in `agent` mode, installed to `~/.tako/`.
2. `systemd --user` unit + `loginctl enable-linger`; detect `KillUserProcesses`; **empirical survive-disconnect verification** before reporting success.
3. Transport = SSH multiplexed channel only; transport abstracted behind a port (relay/tunnel later).
4. Job queue + scheduler on server, persisted; jobs run while disconnected; client reconciles on connect.
5. Job taxonomy: stack lifecycle, maintenance/prune (dry-run first, scopes per ADR-0008), server-config (future stub).
6. TUI per-server tasks section (CRUD + history).
7. Linux-only, user-level privileges.

### Open questions for the user (with tradeoffs)
1. **Binary distribution strategy** — how `~/.tako/tako` gets to the server:
   - (a) *Copy the client's own binary* over SFTP: offline-friendly, version-guaranteed match, no network dependency on the server. Con: arch mismatch possible (client arm64 vs server x64 — must detect and refuse or fall back to (b)); binary size shipped twice.
   - (b) *Download from GitHub Releases* on the server: correct arch always, small transfer. Con: server needs egress to github.com; checksum verification required; fails on air-gapped homelabs.
   - (c) *Hybrid*: try copy, fall back to download on arch mismatch. Recommended, slight extra complexity.
2. **Job-store backend** (Bun on server): `bun:sqlite` is built-in and perfect, but violates ADR-0011's "Bun-only APIs forbidden / Node 20+ compat" rule. Options: (a) `bun:sqlite` + ADR amending 0011 for agent-mode-only code (recommended — compiled binary always runs Bun anyway), (b) `node:sqlite` (stable in Node 22+ only; breaks the stated Node 20 floor), (c) append-only JSON state file (no queries, fragile for history). Needs a decision record either way.
3. **Protocol framing over the SSH channel**: (a) line-delimited JSON (debuggable, no length framing, fine for control-plane sizes), (b) length-prefixed binary frames (efficient for log streaming later). For SSH-only transport and homelab scale, line-delimited JSON (JSON-RPC-ish: request/response + server-push events) is recommended.
4. **Scheduler semantics**: (a) cron expressions (powerful, standard) vs (b) simple intervals/one-shot (`every 24h`, `at 03:00`). Missed-job policy: run-once-on-reconnect, skip, or run-all-missed (with max catch-up count). Recommendation: intervals + one-shot for v0, explicit "run missed once" policy, cron later.
5. **Upgrade policy**: agent pinned to client version at install, auto-upgraded when client connects with a newer version (VS Code-style handshake → replace + restart unit)? Or manual `tako update --host`? Recommendation: handshake advertises versions; mismatch warns; upgrade only on explicit user action in v0.
6. **Agent channel auth**: reuse the SSH connection itself (no extra credential) — implicitly safe since transport is an SSH channel to the agent's unix socket; confirm no separate token is wanted (matters only for the future relay transport).

## Affected Areas

- `src/cli/index.ts` + new `src/cli/commands/agent*.ts` — new `agent` command family (server-side: `tako agent run|install-probe`; NOT via TUI path).
- `src/domains/remotes/infrastructure/Ssh2ConnectionTester.ts` (and a new exec-channel adapter) — SSH gains exec/SFTP/direct-tcpip channels; keep ssh2 as sole consumer.
- `src/domains/agent/` (NEW domain) — domain (job types, schedule, state machine), application (JobQueue, Scheduler, AgentServer ports, VersionHandshake), infrastructure (SqliteJobStore or state store, systemd unit writer, linger prober, SSH transport server adapter).
- `src/domains/docker/` — must finally be implemented for stack lifecycle + prune jobs (compose exec adapter, prune with scopes + dry-run per ADR-0008).
- `src/tui/pages/tasks/` + `src/tui/features/tasks/` + `src/tui/app/routes/tasks.tsx` — per-server tasks UI (list jobs, CRUD form, history/results, prune dry-run preview).
- `src/tui/app/providers/app-runtime.ts` — active remote already available; agent status may join runtime.
- `docs/commands.md` — closed contract: adding `agent` requires ADR (precedent ADR-0014).
- Rollback plan (openspec rule): install writes `~/.tako/`, `~/.config/systemd/user/tako-agent.service`, toggles linger — spec MUST include an uninstall/rollback path that removes unit, disables linger (only if Tako enabled it), deletes `~/.tako/`.

## Risks

- **CRITICAL**: `KillUserProcesses` and linger interplay — linger keeps the *user manager*, but any process still in a *session scope* dies at logout. Only a proper `systemd --user` unit under the lingered manager survives; empirical verification is mandatory, not optional. Distro defaults vary (SUSE `yes`).
- **CRITICAL**: `docker` domain is empty — the job runner's core operations (compose up/down/prune) have zero existing implementation or tests. Scope is bigger than "add an agent": it includes landing the docker domain.
- **CRITICAL**: hosts without systemd (Alpine, containers, systemd-less WSL) — agent cannot run. Must detect and fail with a clear message (matches `install`'s restriction posture).
- **WARNING**: `bun:sqlite` vs ADR-0011 Node-compat rule — architectural conflict that needs an ADR before implementation.
- **WARNING**: `loginctl enable-linger` self-service can be denied by polkit on hardened distros — handle denial with actionable error.
- **WARNING**: prune jobs on a schedule = unattended destructive ops; dry-run-first + ADR-0008 scopes MUST be enforced in the domain, not just the UI.
- **SUGGESTION**: CodeGraph index is missing for this repo (`codegraph init` would speed future structural work).
- **SUGGESTION**: empirical survive-test needs a *second* SSH connection to observe the first disconnecting — design the probe accordingly.

## Recommendation

Self-contained same-binary agent mode (VS Code-style: versioned dir + handshake + checksum when distribution is hybrid), `systemd --user` + linger with empirical probe, line-delimited JSON protocol over one SSH channel, SQLite job store via `bun:sqlite` with an ADR amending ADR-0011 for agent-mode code, interval/one-shot scheduler with run-missed-once policy. Transport behind a `Transport` port from day one so relay is additive.

## Ready for Proposal

Yes — after the orchestrator asks the user: (1) binary distribution strategy, (2) SQLite/bun:sqlite vs ADR-0011, (3) protocol framing, (4) scheduler semantics + missed-job policy, (5) upgrade policy.
