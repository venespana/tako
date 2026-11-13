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
`ask-on-risk` (default). Cached (user, 2026-11-12): **stacked PRs** — each task branch stacks on the previous one (cli-logs → container-stop → health-status). Version bumps ride each task's commit. Review slice pending: T2 assessed `medium` / `under_budget` (no review due; slice accumulates toward T3 per the native budget).

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
- 2026-11-10: document created; decisions recorded.
- 2026-11-10: T1 implemented (delegated writer, TDD RED→GREEN observed).
- 2026-11-12: T1 commit validated by user → `9364cdb` → native review (RDD, consent granted): 2 CRITICAL findings (masked remote failure R3; exit-time stdout truncation R4) → bounded correction (exit-status observability end-to-end + awaited writes) → corrected candidate re-reviewed under successor lineage `review-0d1f6d0ebbf83766` → 2 more CRITICAL found AT the correction (ManagedLogStream wrapper did not forward exit fields — R3 died at the service seam) → second bounded correction (wrapper forwarding + service-level composition tests, 120 lines) → targeted validation **approved** → **acknowledged** (authority burned). Final commit: `ef7c06f` on `feature/cli-logs` (amended work-unit; 1182 tests, typecheck + lint clean).
- 2026-11-12: as-shipped facts: package.json AND the generated `src/shared/lib/version.ts` both read 0.5.0; test counts as shipped: stack-logs 20, adapter 20 (incl. exit-status), CLI logs 14, service composition 3 new; TUI timing-sensitive tests flake under full-suite load (pre-existing class, pass in isolation — unrelated files).
- 2026-11-12: **T3 complete** — commit `f9397d2` on `feature/health-status` (stacked), user-authorized; ADR-0021 (flag-not-command), contract updated, health parsing with the REAL docker shape (string under `Health`, `HealthStatus` since API ≥1.52; object shape is inspect-API only — strings accepted, auxiliary metadata never refuses), hub badge, `status --containers` table with byte-identical default-mode pin. Build verified: `bun run build` compiles `dist/tako-linux-x64`, `--version` = 0.7.0.
- 2026-11-12: **Slice review (T2+T3, 1248 lines) APPROVED + acknowledged on first pass** (lineage `review-5717436fa5823a7e`, authority burned; no refuter needed — 0 blockers/CRITICAL). Verified sound: no command-injection path via stop, no secrets, default CLI mode byte-pinned, graceful health degradation, version contract consistent. 10 advisory follow-ups parked (below).
- 2026-11-12: advisory (non-blocking) parked from the T1 review: unbounded follow-mode line buffer (adapter); console.log sink makes the flush-before-exit guarantee vacuous in production (wire flush-aware sinks in cli/index.ts); SIGINT during follow can wedge teardown (no force-exit fallback); stack-name grammar accepts uppercase though compose projects are lowercase-only; duplicated line machinery + service wiring (extraction follow-up); exit contract carried outside the type system (casts); opaque R3/R4 labels in comments; adapter re-exports the domain builder.
- 2026-11-12: advisory (non-blocking) parked from the slice review (T2+T3): runStatus duplicates the outcome→exit mapping in two switches (WARNING); no timeout/cancel on stop and the in-flight guard wedges hub-wide if the remote never returns (worsened-vs-baseline, SUGGESTION); STOP_RUNNING_VERB stem contract untyped (SUGGESTION); runShortcut is the shared status→op resolver but its name says list-pane-only (SUGGESTION); action lists + per-status rule duplicated across model and hook modules (SUGGESTION ×2); dead `| null` member + dead second guard on ContainerEntry.health (SUGGESTION); `s` on group rows untested (SUGGESTION); one test comment promises an untested invariant (SUGGESTION); single-keypress stop with no confirmation is user-validated design (WARNING, informational).
- 2026-11-12: **CI flake-class recurrence FIXED deterministically** (`773e441`, in PR #17): the LogsPage reconnect tests used a fixed 100ms `flush()` + immediate counter assertions — on slow CI runners the key raced the assertions (2/2 CI red, varying subsets, 9s exhausted settles). Replaced with the repo doctrine: condition-based `pressAndSettle` (drop retry, safe by the hook's re-entry guard) + scaled `KEY_FLUSH_MS` waits for the inert case; counters asserted only after the frame proves the key landed. Post-fix CI on the integrated diff: **all 5 checks green** (run 43272172358). PR chain state: #15 green, #16/#17 get CI when retargeted to main on merge, #18 tracker green.
- 2026-11-12: **T4 COMPLETE — RA-001 fully validated** on the user's local (`local` = venespana@127.0.0.1:22): install pipeline ✓ (survive-disconnect probe passed), status ✓ (active / 0.7.0 = 0.7.0 / handshake ok), idempotent reinstall ✓ (same sha256, linger kept-as-is), uninstall ✓ (clean residue, linger preserved by only-by-tako rule), reinstall-after-uninstall ✓ (pipeline green, handshake ok). Evidence in `remote-agent-followups.md`. Optional residual: homeServer re-validation after its SSD replacement. **Next: T5 — the release (user-owned): merge the stacked branches via PRs, then push tag `v0.7.0` (ADR-0017) → assets + sha256 → RA-002/RA-003 unblocked.**
- 2026-11-12: **T2 complete** — commit `9061627` on `feature/container-stop` (stacked on cli-logs), user-validated ("todo funcionando" after catching one defect themselves: inert `s` on exited containers → now status-aware, `s` stops running/paused and STARTS exited, hints honest per status). 1202 tests, typecheck + lint clean. RDD assess: medium / under_budget (no review due; pending slice). Next: T3.
- 2026-11-12: **CHAIN MERGED — MVP on main.** Merge order executed with one routing lesson: #15 merged to main first (merge commit — required for stacked children to keep clean diffs); #16 was then merged into its parent branch by mistake (content stranded on cli-logs) — recovered by closing the redundant tracker #18, retargeting #17 (the full stack tip) to main and merging: `e275e21` brought T2+T3+flake-fix+docs to main. Main history: Merge #15 → Merge #16 → fix → Merge #17. Main CI: **success** (run 43276110183). package.json + generated version.ts = **0.7.0**. Branches deleted (remote + local); PRs #15/#16/#17 merged, #18 tracker closed without merging.
- 2026-11-13: **T5 COMPLETE — RELEASE v0.7.0 PUBLISHED.** First tag push failed: `setup-bun` needs `unzip` and the intentional `debian:bookworm` build container (low glibc floor) lacked it — fixed with one apt line (`3982de1`, `ci(release): install unzip`), tag re-pointed (release never existed, no consumers). Second run: **success** on both arches. Release `v0.7.0` published as PRERELEASE (v0.x track) with `tako-linux-x64`, `tako-linux-x64.sha256`, `tako-linux-arm64`, `tako-linux-arm64.sha256`. **MVP v0.1 CLOSED: all 5 tasks done.** RA-002 (arm64 e2e) and RA-003 (Releases-fallback e2e) are now actionable.
