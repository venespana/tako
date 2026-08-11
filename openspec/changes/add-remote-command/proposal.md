# Proposal: `tako remote add` (MVP) — interactive SSH connection wizard

> Change: `add-remote-command` · Store: hybrid (Engram + OpenSpec) · Phase: propose · Builds on `exploration.md` (Approach 3 — Hybrid)

## Intent

`tako remote add` is the second CLI command. Users cannot yet register an SSH host to manage. This MVP delivers an interactive Ink wizard: collect connection details, validate the SSH connection before saving, detect duplicates, persist. `local` is the implicit default mode (not configurable here); only SSH connections are registered.

## Scope

### In Scope
- New `remotes` domain (Clean Arch): ports `RemoteRepository`, `SshConnectionTester`, `SecretVault`; use cases `AddRemote`, `ValidateSshConnection`, `CheckDuplicateRemote`.
- Interactive Ink wizard (`@inkjs/ui`): username, host, port (default 22), credential type (`store` | `ssh-key`), conditional password save, connection name (unique identifier).
- SSH validation via ssh2 before persist; re-show form with mapped error on failure.
- Duplicate detection (name or `user@host`) → warn-and-allow-override.
- Persistence via conf; stored passwords obfuscated (`encryptionKey`) — v0 placeholder, NOT secure.
- ADR 0014: un-deferring the wizard UX + accepting conf-obfuscation as v0 posture.

### Out of Scope
- `remote list | rm | use | test` subcommands.
- Master-passphrase / OS-keyring secrets (deferred behind `SecretVault` port).
- Hostkey verification / TOFU, passphrase-protected keys, `local` type UI, `--json` / non-interactive flags.

## Capabilities

> Contract for sdd-spec. `openspec/specs/` currently holds only `host-dependency-check`.

### New Capabilities
- `remote-connection-management`: interactive collection, SSH pre-save validation, duplicate detection, conditional password storage, atomic persistence of SSH remotes.

### Modified Capabilities
- None.

## Approach

Approach 3 (Hybrid) from exploration. Replicate the `system` domain pattern: `domain/types.ts` + constants → `application/<Port>.ts` + `<UseCase>.ts` (ctor-injected ports, never throws) → `infrastructure/<Adapter>.ts` (sole ssh2/conf consumer). `SecretVault` port isolates the deferred master-passphrase decision; default adapter = conf-obfuscation, swappable later with zero domain changes. CLI handler renders the Ink wizard (same Ink `render()` entry). Dependency rules respected: `shared→none`, `remotes→shared`, `cli/tui→remotes+shared`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/domains/remotes/{domain,application,infrastructure}/` | New | remotes domain + ports + conf/ssh2 adapters |
| `src/cli/index.ts`, `src/cli/commands/remote-add.ts` | New/Mod | route `remote add`, render wizard |
| `src/tui/features/remotes/add-remote-wizard/` | New | multi-step Ink form |
| `src/shared/{types,errors,lib}/` | New | `Result`, `TakoError` subclasses |
| `package.json` | Mod | add `@inkjs/ui` |
| `docs/decisions/0014-*.md`, `docs/commands.md` | New/Mod | ADR + un-defer wizard |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `remote` (singular) deviates from closed contract `remotes` (plural) | Med | ADR 0014 records deviation; git `remote add` convention supports singular; reverse to plural if preferred |
| conf obfuscation ≠ encryption; secrets recoverable from binary | High | UI + docs MUST NOT advertise as secure; tracked as explicit debt behind `SecretVault` port |
| hostkey not verified by ssh2 (TOFU gap) | Med | v0: connect-success = valid; TOFU as follow-up; noted in ADR |
| ssh2 failure modes unmapped → hostile error loop | Med | Map auth-fail / network / timeout to distinct wizard messages; `readyTimeout: 10_000` |
| `@inkjs/ui` not installed (stack.md vs reality mismatch) | Low | Add dep; fallback to raw `useInput`/`useFocus` |

## Rollback Plan

All additive. Revert by deleting `src/domains/remotes/`, `src/cli/commands/remote-add.ts`, the wizard dir (`src/tui/features/remotes/add-remote-wizard/`), the `@inkjs/ui` dep, and restoring `src/cli/index.ts` routing. No host state, compose files, or embedded templates touched; any conf-written remotes stay inert until a future `remote list/use` consumer reads them.

## Dependencies

- `@inkjs/ui` (new); `ssh2@1.17`, `conf@15.1`, `ink@7.1`, `commander@15` already present.

## Success Criteria

- [ ] `tako remote add` opens the wizard and saves a validated SSH connection.
- [ ] Invalid SSH → form re-shown with actionable error; no save.
- [ ] Duplicate name or `user@host` → warning, allow override.
- [ ] Stored passwords obfuscated in conf; never logged.
- [ ] `bun run test | typecheck | lint | build` clean; strict TDD; no dependency-rule violations.
