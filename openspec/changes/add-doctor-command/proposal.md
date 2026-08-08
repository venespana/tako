# Proposal: tako doctor (MVP) — host dependency check

## Intent

`tako doctor` is the first command implemented and the project's pre-flight gate. Today the CLI is a stub (`src/cli/index.ts`); there is no way for a user to know whether their machine is ready to run tako. This change delivers the MVP slice: detect and report whether the required **local** host tools (`ssh`, `git`, `docker`) are installed, print their versions or "not found", and exit non-zero if any required tool is missing. **No SSH connection is made.**

> **Scope note (needs confirmation — see Question Round):** `docs/commands.md` describes `doctor` as a *remote* pre-flight (docker daemon, compose v2, `caddy` network, base services). This change delivers the **local** dependency-check slice first and treats the remote readiness check as a deferred iteration of the same command. `doctor` already exists in the closed 9-command contract — no new command is introduced.

## Scope

### In Scope
- Wire CLI entry (`src/cli/index.ts`) to route `tako doctor` to a handler.
- New `system` domain (Clean Arch): `CheckHostDependencies` use case + `HostToolChecker` port.
- Infrastructure adapter probing local `PATH` for `ssh`, `git`, `docker` and capturing version strings.
- Friendly report (check/cross + version or "not found", via `picocolors`).
- Exit code: `0` if all required present, `1` if any missing.
- Unit tests co-located; strict TDD (RED->GREEN->REFACTOR).

### Out of Scope
- Remote/server pre-flight (docker daemon, compose v2, caddy network, base services).
- Minimum-version comparison / semver parsing.
- `--json` output, fix suggestions, auto-install.
- `docker compose` plugin detection (deferred — see questions).

## Capabilities

> Contract for sdd-spec. This is the first spec in the repo (`openspec/specs/` is empty).

### New Capabilities
- `host-dependency-check`: detect presence + version of required local host tools, format a report, and derive the command exit code.

### Modified Capabilities
- None (no specs exist yet).

## Approach

Follow the hybrid architecture: a thin CLI handler parses argv and calls a use case. Add a `system` domain replicating `docker`'s structure — `domain/` (types: `HostTool`, `CheckResult`), `application/` (`CheckHostDependencies` use case + `HostToolChecker` port), `infrastructure/` (`LocalHostToolChecker` adapter using `Bun.spawn` / PATH lookup). The required-tools list is a constant owned by the domain. `application` imports no `child_process`/`process` directly (port/adapter split). Dependency rules respected: `shared->none`, `system->shared`, `cli->system+shared`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/cli/index.ts`, `src/cli/commands/doctor.ts` | New | argv routing + doctor handler |
| `src/domains/system/{domain,application,infrastructure}/` | New | host-check domain (Clean Arch) |
| `src/shared/lib/`, `src/shared/types/` | Modified | reuse logger/colors + Result type (only if helpers exist) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Scope diverges from docs/commands.md (remote pre-flight) | Med | Confirm in Question Round; record scoping as an ADR if needed |
| Adapter shell-out is hard to unit-test | Med | Inject `HostToolChecker` port; fake adapter in tests |
| Over-building (semver, json) | Low | Strict out-of-scope list above |
| Domain name `system` may be too generic | Low | Finalize naming in design phase |

## Rollback Plan

All changes are additive (new domain + entry routing). Revert by deleting `src/domains/system/`, `src/cli/commands/doctor.ts`, and restoring `src/cli/index.ts` to the stub `console.log`. No host state, compose files, or embedded templates are touched, so rollback carries no operational risk.

## Dependencies

- Bun runtime `Bun.spawn` (available; no new dependency).

## Success Criteria

- [ ] `tako doctor` prints a report for ssh, git, docker with version or "not found".
- [ ] Exit `0` when all required tools present; exit `1` when any missing.
- [ ] `bun run test` (unit) green; strict TDD followed.
- [ ] `bun run typecheck`, `bun run lint`, `bun run build` all clean.
- [ ] No dependency-rule violations (no tui<->cli; domain knows no presentation).
