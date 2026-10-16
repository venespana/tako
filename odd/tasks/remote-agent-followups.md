# Remote agent follow-ups (migrated from openspec)

## Objective

Track the open items left by the `remote-agent` change after openspec was retired as
the project workflow. ODD (`odd/tasks/*.md`) is the only planning/tracking mechanism now.

## Source

- Archived: `openspec/changes/archive/2026-10-16-remote-agent/` (verified per its
  `verify-report.md`; read-only audit trail — never modify it).
- Migration date: 2026-10-16, branch `chore/archive-openspec-to-odd`.

## Tasks

- [ ] RA-001 — Real-world validation on an actual homelab server. This was the only
      gate keeping the change from being marked archive-ready
      (`verify-report.md:81-83`).
- [ ] RA-002 — Native arm64 e2e validation (task 8.15, test already written:
      `tests/e2e/agent-arm64.e2e.ts`). Requires a native arm64 runner; gated by
      `TAKO_E2E_ARM64=1` + `TAKO_E2E_BINARY`.
- [ ] RA-003 — Releases-fallback e2e (task 8.16, test already written:
      `tests/e2e/agent-releases-fallback.e2e.ts`). Blocked on the first published
      arm64 release (env-pinned version).
- [ ] RA-004 — `tako agent proxy` exec-mode transport. Explicitly left open as a
      separate change (archived `tasks.md:163`, item 3).

## Constraints

- Never modify folders under `openspec/changes/archive/` (audit trail).
- Command contract in `docs/commands.md` stays closed: no new commands without a
  decision record.
- RA-003 depends on cutting the first arm64 release (ADR-0017 tag-push flow).

## Notes

- One-shot scheduling stays deferred: "v0 is cron-only" (archived `design.md:86`).
- Next planned feature (MVP v0.1): `status` and `logs` commands — separate feature
  documents, not tracked here.
