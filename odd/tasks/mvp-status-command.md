# MVP status command (`tako status`)

## Objective

Ship `tako status` (MVP v0.1 per docs/index.md): a non-interactive table of compose
stack status on a host, over SSH, for scripts/cron — split into small, independently
testable units following the existing docker-domain / services / CLI patterns.

## Problem & why

The roadmap (docs/index.md:23) defines MVP v0.1 as doctor (done) + status + logs.
`status` is the smaller of the two missing commands: read-only, no rollback plan
required. No compose-ps adapter exists in domains/docker today (verified 2026-10-16);
the SSH-exec machinery to reuse lives in domains/remotes
(`RemoteCommandRunner` port + `SshRemoteCommandRunner`).

## Named decision (CONFIRMED by user 2026-10-16)

- **Host selection shape**: `--host <name>` **required** for this slice (loud refusal
  if absent, matching the ParsedFlag convention), because the fallback source for an
  optional host (default remote from `remotes use`) is not implemented yet. Make it
  optional in a later slice once `remotes use` exists. docs/commands.md gets the
  implemented shape in S7.

## Scope

In: docker domain types+parser+use case+SSH adapter, services wrapper, CLI command
with pure table formatter, unit + integration tests, docs update for the status
section. Out: TUI StatusPage wiring (stub stays), `logs` command (separate feature
doc), `-a/--all` style flags beyond the contract, default-remote resolution.

## Constraints

- Command contract stays closed: `status` is one of the 10; no new commands.
- Read-only over the host: no rollback plan required (per AGENTS.md rule), but the
  use case must treat remote failures as data (refusal objects, never throw expected
  outcomes).
- Dependency rules: cli → services only; application never imports infrastructure;
  adapter lives in domains/docker/infrastructure and consumes the remotes domain's
  `RemoteCommandRunner` port (injected).
- TDD: every unit observes RED before GREEN (Vitest unit, co-located).
- Review: native RDD review transport is refusing (`output_refused`, defect recorded
  in memory 2026-10-16); per user decision we continue under ordinary policy — each
  work-unit commit gets user manual review before the next one starts.

## Checklist (small testable units)

Part A — docker domain (branch `feature/mvp-status-command` off `main`):

- [ ] S1 — `domain/stack-status.ts`: `StackStatusEntry` type + pure parser
      `parseComposeLsJson(stdout): StackStatusEntry[]` for `docker compose ls
      --format json` output (array or JSON-lines tolerant). Unit test with fixture
      strings: happy path, empty list, malformed line skipped-or-refused (decide:
      strict refusal, matching loud-refusal convention). Route: inline writer.
- [ ] S2 — `application/GetStackStatus.ts`: port `ComposeStatusReader { read():
      Promise<CommandExecution> }` co-declared; use case runs probe, treats nonzero
      exit as refusal data, returns `{kind:'ok', entries} | {kind:'refusal', reason}`.
      Unit test with fake reader (exit 0 / exit 1 / empty output). Route: inline writer.
- [ ] S3 — `infrastructure/RemoteComposeCliAdapter.ts`: implements the port over an
      injected `RemoteCommandRunner`; builds exact argv `docker compose ls --format
      json`. Unit test with fake runner (assert command string). Integration test:
      slim sshd container + stub `docker` shell script on PATH emitting fixture JSON
      (no docker-in-docker needed). Route: inline writer (delegated if >2 files).
- [ ] S4 — `services/docker.ts`: add `getStackStatus(host)` — lazy imports, private
      wiring: remotes service resolution → `SshConnectionManager` →
      `SshRemoteCommandRunner` → adapter → use case; `manager.end()` on all paths.
      Outcome union includes `unknown-remote`. Unit test mocking adapters
      (style of services/docker.test.ts). Route: inline writer.

Part B — CLI surface:

- [ ] S5 — `cli/commands/status.ts`: pure `formatStatusTable(entries): string[]`
      (padEnd label/value rows, style of `formatAgentStatus`). Unit test pure.
      Route: inline.
- [ ] S6 — `cli/commands/status.ts`: `runStatus(io, {host})` — ParsedFlag loud
      parsing, service call, outcome switch → print/error + exit code
      (0 ok · 1 refusal/invalid · 2 unexpected); register `status` in
      `buildProgram()` with lazy import. Unit tests with remote-add-style harness
      (unknown remote, ssh refusal, happy table, missing --host). Route: inline writer.
- [ ] S7 — docs: expand docs/commands.md status section (usage, exit codes, example
      output); reconcile the `[--host X]` vs `<host>` ambiguity with the implemented
      shape. Structural check only. Route: inline.

Close-out:

- [ ] S8 — Bump `package.json` minor (new command) when opening the PR (repo rule:
  every PR bumps version). Delivery: forecast ≈ 600–700 authored lines (incl. tests)
  → strategy `ask-on-risk` (default): expect 2 chained slices (domain A / CLI B);
  ask once when the threshold is crossed.

## Acceptance criteria

- `tako status --host X` prints a stack table and exits 0 against a containerized SSH
  host with a working `docker compose ls`.
- Unknown host, refused SSH, missing compose, and absent `--host` each produce a
  clear stderr line and the documented exit code; nothing throws expected outcomes.
- All units show RED→GREEN evidence; `bun run test && bun run typecheck && bun run
  lint` pass at close.

## Progress

- 2026-10-16: feature doc created from pattern mapping (explore handoff); S1–S8
  pending; awaiting user confirmation of the host-selection decision before S6.

## Verification evidence

(recorded per unit as it closes)
