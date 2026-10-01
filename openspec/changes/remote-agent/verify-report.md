# Verify Report — remote-agent

```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:3aa9389
verdict: VERIFIED
blockers: 0
critical_findings: 0
requirements: 28/28
scenarios: 44/44 (gated 2 excluded by design)
test_command: bun run test
test_exit_code: 0
test_output_hash: sha256:fb1c5f0f937dd3ca37f4a4bf408bd4ba942beb1f439be40b15994074061f6d7d
build_command: bun run typecheck && bun run lint
build_exit_code: 0
lint_output_hash: sha256:f07d86e106d90181f8cf28b7589aae24f8e6f7ae6921b3fc6e4410ec96da0932
integration_command: bun run test:integration
integration_exit_code: 0
integration_result: "bunqueue 3 passed / 1 skipped (privileged systemd env-gate) / docker 7 passed / 3 skipped"
e2e_command: bun run test:e2e
e2e_exit_code: 0
e2e_result: "2 skipped files / 5 skipped tests (env-gated 8.15 arm64 + 8.16 releases-fallback)"
routes_idempotent: true
```

## Completeness

- Tasks: 87 total — 85 complete, 0 incomplete, 2 gated/unchecked by design (8.15 native-arm64 e2e, 8.16 releases-fallback e2e).
- Version bumped to 0.2.0 (minor).

## Gates

| Gate | Result |
| --- | --- |
| `bun run lint` | ✅ 0 errors (2 pre-existing warnings outside the change) |
| `bun run typecheck` | ✅ 0 errors |
| `bun run test` | ✅ 84 files / 723 tests |
| `bun run test:integration` | ✅ 7 passed / 3 env-skipped |
| `bun run test:e2e` | ✅ 5 env-gated skips (8.15/8.16 by design) |
| `bun run generate:routes` | ✅ idempotent |

## Spec Compliance

All five delta specs walked requirement-by-requirement; 44/44 non-gated scenarios have real test coverage in the final code:

| Spec | Requirements | Scenarios | Result |
| --- | --- | --- | --- |
| remote-agent-install | 6 | 16 | ✅ compliant |
| agent-transport | 5 | 7 | ✅ compliant |
| agent-jobs | 9 | 11 | ✅ compliant |
| tui-tasks | 4 | 5 | ✅ compliant |
| remote-connection-management | 4 | 5 | ✅ compliant |

Representative evidence per requirement is recorded in apply-progress (obs #492) and the WU verifier reports; notable mappings: hybrid distribution + decoy guard (`agent-install.test.ts`), compose v2 refusal (`InstallAgent.test.ts` + flow test), survive-disconnect probe (`SurviveDisconnectProber.test.ts`), missed-once + crash guard (`RunSchedulerLoop.test.ts` + `MissedOnceCatchUp.test.ts`), prune structural safety (`prune-policy.test.ts` + `prune-scope-parity.test.ts`), reconcile (`UnixSocketAgentServer.test.ts` + `TasksPage.test.tsx`).

## Cross-Cutting Audits

- `conf` consumed only via `remotes/infrastructure/createConfStore.ts` ✅
- `ssh2` absent from `src/cli/` and `src/tui/` ✅; `ink` absent from `src/cli/` ✅
- No bunqueue Worker anywhere; `upsertJobScheduler` mirror removed; `open()` sweeps persisted schedulers (9.8) ✅
- Firing authority: `RunSchedulerLoop` watermark tick is the sole run trigger ✅
- ADR-0008 structural safety: closed 3-scope union, `-af`/volume prune unrepresentable, parity witness test ✅
- `useInput` only inside `use-key-bindings.ts`; all 8 production sites migrated (9.9) ✅
- Linger by-tako compensation on marker-write failure ✅; 'unknown' linger → enable but never record ✅

## Design Coherence

D1–D8 followed (streamLocal channel + 0600 auth, agent command family, bunqueue storage-only with watermark firing authority, type-only cross-domain imports, hybrid docker access, pure-TS cron, tag-push release, server-side linger tracking with compensation).

## Issues

- CRITICAL: none
- WARNING: none
- SUGGESTION: none (2 pre-existing lint warnings predate the change)

## Deferred (non-blocking)

- 8.15 arm64 e2e — requires native arm64 runner (`TAKO_E2E_ARM64=1`).
- 8.16 releases-fallback e2e — requires the first published arm64 release.

## Verdict

**VERIFIED** — archive-ready pending real-world validation on an actual homelab server.
