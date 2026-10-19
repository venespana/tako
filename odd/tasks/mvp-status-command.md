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

- [x] S1 — `domain/stack-status.ts`: `StackStatusEntry` type + pure parser
      `parseComposeLsJson(stdout): StackStatusEntry[]` for `docker compose ls
--format json` output (array or JSON-lines tolerant). Unit test with fixture
      strings: happy path, empty list, malformed output (strict refusal, confirmed
      by user 2026-10-17 — loud-refusal convention; corrupt output is never
      partially rendered). Route: inline writer.
- [x] S2 — `application/GetStackStatus.ts`: port `ComposeStatusReader { read():
Promise<CommandExecution> }` co-declared; use case runs probe, treats nonzero
      exit as refusal data, returns `{kind:'ok', entries} | {kind:'refusal', reason}`.
      Unit test with fake reader (exit 0 / exit 1 / empty output). Route: inline writer.
- [x] S3 — `infrastructure/RemoteComposeCliAdapter.ts`: implements the port over an
      injected `RemoteCommandRunner`; builds exact argv `docker compose ls --format
json`. Unit test with fake runner (assert command string). Integration test:
      slim sshd container + stub `docker` shell script on PATH emitting fixture JSON
      (no docker-in-docker needed). Route: inline writer (delegated if >2 files).
- [x] S4 — `services/docker.ts`: add `getStackStatus(host)` — lazy imports, private
      wiring: remotes service resolution → `SshConnectionManager` →
      `SshRemoteCommandRunner` → adapter → use case; `manager.end()` on all paths.
      Outcome union includes `unknown-remote`. Unit test mocking adapters
      (style of services/docker.test.ts). Route: inline writer.

Part B — CLI surface:

- [x] S5 — `cli/commands/status.ts`: pure `formatStatusTable(entries): string[]`
      (padEnd label/value rows, style of `formatAgentStatus`). Unit test pure.
      Route: inline.
- [x] S6 — `cli/commands/status.ts`: `runStatus(io, {host})` — ParsedFlag loud
      parsing, service call, outcome switch → print/error + exit code
      (0 ok · 1 refusal/invalid · 2 unexpected); register `status` in
      `buildProgram()` with lazy import. Unit tests with remote-add-style harness
      (unknown remote, ssh refusal, happy table, missing --host). Route: inline writer.
- [x] S7 — docs: expand docs/commands.md status section (usage, exit codes, example
      output); reconcile the `[--host X]` vs `<host>` ambiguity with the implemented
      shape. Structural check only. Route: inline.

Close-out:

- [x] S8 — Bump `package.json` minor (new command) when opening the PR (repo rule:
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
- 2026-10-17: host decision already confirmed; S1 parser strict-refusal confirmed
  by user; S1 implemented (RED→GREEN).
- 2026-10-19: user manually reviewed S1 (validation harness + real docker output);
  ESLint conventions added (blank lines around control blocks, iterable ops over
  for loops) and S1 rewritten accordingly; S1 committed (see evidence).
- 2026-10-19: S2 implemented (RED→GREEN) — commit pending user approval.
- 2026-10-19: S2 committed (5fe2d96); S3 implemented (unit RED→GREEN + integration
  over real ssh) — commit pending user approval.
- 2026-10-19: S3 committed (f212bd9); S4 implemented (service wiring, RED→GREEN)
  — commit pending user approval. Note: 1-2 TUI remotes-menu tests are flaky
  under full-suite load (pass in isolation) — pre-existing, follow-up.
- 2026-10-19: S4 committed (aff5f1b); S5 implemented (pure table formatter,
  RED→GREEN) — commit pending user approval.
- 2026-10-19: S6 committed (111c76f); S7 done (docs/commands.md status section
  reconciled to the implemented required `--host <remote>` shape) and S8 done
  (package.json 1.0.0 → 1.1.0 + regenerated version.ts, which was stale at
  0.2.0 in the repo). Commit pending user approval.

## Verification evidence

- S1 (2026-10-17): RED observed (module not found); GREEN 13/13
  (`stack-status.test.ts`); `bun run typecheck` clean; `bun run lint` clean
  (after prettier --fix on the test fixture string); full unit suite 811/811.
  Commit: this commit — `feat(docker): stack status type + strict compose ls
parser (S1)`. Re-verified 2026-10-19 after the lint-convention rewrite to
  `.map` (13/13, scoped lint, typecheck); lint rules shipped first in
  `chore(lint): require blank lines around control blocks, prefer iterable
ops over for`.
- S2 (2026-10-19): RED observed (module not found); GREEN 8/8
  (`GetStackStatus.test.ts` — ok/refusal mapping, signal kill, strict parser
  passthrough, single port read); scoped lint + `tsc --noEmit` clean. Pattern
  mirrors `RunStackLifecycle` (class use case, co-declared port).
  Commit: 5fe2d96.
- S3 (2026-10-19): unit RED observed; GREEN 4/4 (`RemoteComposeCliAdapter.test.ts`
  — exact fixed command, field passthrough, composition with GetStackStatus,
  exit-127 refusal). Integration (`remote-compose-status.integ.test.ts`): alpine
  sshd built on the fly + stub `docker` on /usr/bin, production chain over real
  ssh returns the fixture table; disabling the stub in-container yields the
  refusal (`not found`). Integration project 7 passed / 5 env-skipped; unit
  suite 823/823; scoped lint + `tsc --noEmit` clean. Commit: f212bd9.
- S4 (2026-10-19): RED observed; GREEN 8/8 (`services/docker.test.ts` — wiring
  order, sessionPassword passthrough, unknown-remote/refusal without opening a
  connection, `manager.end()` even on unexpected throw, laziness). Reuses
  `resolveRemoteAuth` (fresh per call, union already carries `unknown-remote`).
  Full suite 828/828 (1 TUI flaky on one run, green on rerun); scoped lint +
  `tsc --noEmit` clean. Commit: aff5f1b.
- S5 (2026-10-19): RED observed; GREEN 3/3 (`status.test.ts` — aligned header+
  row, column widening, explicit empty state). One test expectation corrected
  (miscounted label width; implementation was right). Scoped lint + typecheck
  clean. Commit: 5ced56d.
- S6 (2026-10-19): RED observed; GREEN 10/10 in `status.test.ts` (7 new —
  missing/empty --host loud refusal, happy table + env session password
  passthrough, empty listing, unknown-remote, refusal, unexpected throw → 2).
  `status` registered in `buildProgram()` with lazy import; real-binary smoke
  (`bun run src/index.tsx status`) prints the refusal and exits 1. Scoped lint
  - `tsc --noEmit` clean. Commit: pending approval.

## Delivery

- 2026-10-19: strategy `ask-on-risk` → user chose ONE PR (units were reviewed
  manually one by one). PR #10: https://github.com/venespana/tako/pull/10
  (base main, 10 commits). Follow-ups recorded: legacy lint cleanup (770
  pre-existing violations under the 2026-10-19 conventions), flaky TUI
  remotes-menu tests under load, TUI StatusPage wiring (separate feature).
