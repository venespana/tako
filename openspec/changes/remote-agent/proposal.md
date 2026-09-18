# Proposal: remote-agent — persistent agent on managed servers

## Intent

Tako is interactive-only: nothing runs server-side while the client is disconnected, yet homelabs need unattended jobs (lifecycle, prune). Add a persistent user-level agent — same binary in agent mode at `~/.tako/`, `systemd --user` + linger — reached only via SSH.

## Scope

> One-command/feature convention: `remote-agent` is one feature spanning several commands, structured as **slices** mapping 1:1 to capability specs; full split rejected: shared contract, dead intermediate states.

### In Scope (slices)

1. **Provisioning** — `agent install | uninstall`: hybrid distribution (copy binary + sha256 → Releases fallback on arch mismatch → explicit failure), `uname -m` detection, systemd user unit + linger, `KillUserProcesses` detection, mandatory survive-disconnect probe (second SSH connection), non-systemd refusal.
2. **Transport** — `Transport` port (relay later); SSH multiplexed-channel adapter; line-delimited JSON (request/response + push events); version handshake (mismatch warns; manual upgrade); SSH-identity auth.
3. **Job engine** — `agent run`; `bun:sqlite` queue + scheduler; cron; missed jobs run once on reconnect; reconcile on connect.
4. **Taxonomy** — stack lifecycle (implements empty `src/domains/docker/`, ADR-0008); prune: scopes, dry-run-first, report-before-apply; server-config stub.
5. **TUI tasks** — per-server job CRUD, schedule editing, history/results, dry-run preview.
6. **Release prerequisites** — release CI workflow, per-arch assets (arm64), `docs/distribution.md` update.
7. **ADRs** (below).

### Out of Scope

Relay/tunnel transport; auto-upgrade; server-config jobs; non-Linux hosts; root install; log streaming.

## Capabilities

### New Capabilities

- `remote-agent-install`: install, distribution, systemd/linger, probe, uninstall.
- `agent-transport`: Transport port, SSH adapter, protocol, handshake, auth.
- `agent-jobs`: queue, scheduler, persistence, reconciliation.
- `tui-tasks`: per-server job management UI.

### Modified Capabilities

- `remote-connection-management`: ssh2 adapter gains exec/SFTP/multiplexed channels behind new ports.

## Approach

VS Code-style provisioning, runner-style jobs: copy client binary (version match free; post-copy sha256); Releases only on arch mismatch. Durable queue, idempotent job IDs, reconcile-on-connect. Unit under the lingered user manager survives `KillUserProcesses`; success only after empirical verification.

## ADRs Required

| ADR | Subject |
| --- | --- |
| New | `agent` command family — contract deviation (precedent ADR-0014) |
| Amendment | ADR-0011: `bun:sqlite` exception for agent-mode code |
| Resolution | ADR-0006 vs AGENTS.md release trigger; per-arch assets |

## Affected Areas

- New: `src/domains/agent/`, `src/cli/commands/agent*.ts`, `src/tui/{pages,features}/tasks/`, `.github/workflows/release.yml`
- Modified: `src/domains/docker/` (implemented), `src/domains/remotes/infrastructure/` (channels), `src/tui/app/routes/`, `docs/commands.md`, `docs/distribution.md`, `docs/decisions/`

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| KillUserProcesses/linger variance; polkit denial | Med | Empirical probe mandatory; actionable errors |
| Docker domain from zero | High | Taxonomy slice first; testcontainers |
| Unattended prune destructive | Med | Dry-run-first + ADR-0008 scopes in domain |
| No release pipeline yet | Med | Slice 6 prerequisite; explicit failure |

## Rollback Plan

Product: `agent uninstall` removes the unit, disables linger only if Tako enabled it, deletes `~/.tako/`. Change: PR revert after uninstall — reverted clients leave an inert agent.

## Dependencies

Release workflow before download-fallback e2e; ADRs first.

## Success Criteria

- [ ] Survive-disconnect probe passes on x64 + arm64
- [ ] Scheduled prune runs disconnected; reconcile on connect
- [ ] Uninstall leaves no unit, linger, or `~/.tako/` residue
- [ ] Per-arch assets published; release-trigger contradiction resolved

## Open Items for Spec/Design

Agent subcommands; protocol schema; state machine; SQLite schema; probe mechanics; TUI layout; linger tracking.
