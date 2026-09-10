# Proposal: Interactive SSH Authentication for Remote Add

## Intent

`SshCredentialType` supports only `store | ssh-key`. Per-session passwords require `store` + `savePassword: false` — intent encoded implicitly (absent `obfuscatedPassword`) and nothing prompts at connect time. Add `interactive`: password typed at every connection attempt, never written to disk.

## Scope

### In Scope
- Widen `SshCredentialType` to `'store' | 'ssh-key' | 'interactive'`
- Wizard: third TypeStep option; interactive skips the save-password question, collects a one-time validation password
- `AddRemote`: password-auth dispatch; persists zero secret material
- Connect-time: selecting an interactive remote prompts for, validates, and session-holds the password
- New `RemoteRepository.getByName` port (+ conf adapter)
- Read-time normalization: legacy `store` remotes without `obfuscatedPassword` behave as interactive

### Out of Scope
- `remotes use/test`; full SSH session manager (later change)
- Master passphrase / OS keyring; passphrase-protected keys
- Persisted-`credentialType` migration in conf

## Capabilities

### New Capabilities
- `remote-interactive-auth`: connect-time password prompt; session-scoped retention; re-prompt every connection attempt.

### Modified Capabilities
- `remote-connection-management`: "Field & Credential Collection" gains `interactive`; the `store` save-password "No" branch is superseded (scenario "store transient password" modified). Main spec is missing from `openspec/specs/` (only in `changes/archive/2026-09-08-add-remote-command/`); spec phase merges against the archive.

## Approach

Type-driven dispatch: `store` → deobfuscate stored password; `ssh-key` → key file; `interactive` → prompt every connection. Wizard: `setType('interactive')` routes straight to the password step; `AddRemote.save` persists `credentialType:'interactive'` with no secret fields. Connect-time: remotes-selection intercepts interactive picks, loads via `getByName`, renders a masked prompt, validates via `ValidateSshConnection`, stores the secret in `AppRuntime` (memory-only, session lifetime).

**vs `store + savePassword:false`**: both persist no secret; `interactive` encodes intent in the type and mandates the connect-time prompt; `store`-without-password survives only as a read-time-normalized legacy shape.

## Affected Areas

| Area | Impact | Change |
|------|--------|--------|
| `src/domains/remotes/` (types, AddRemote, RemoteRepository, ConfRemoteRepository) | Modified | type widening; auth dispatch; `getByName` |
| `src/tui/features/remotes/add-remote-wizard/**` | Modified | TypeStep option, step routing, draft build |
| `src/tui/pages/remotes-menu/**`, `src/tui/app/providers/app-runtime.ts` | Modified | selection prompt, session credential memory |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `store`+no-save no longer creatable (breaking) | Med | read-time normalization keeps legacy remotes working |
| Main spec missing from `openspec/specs/` | Med | spec phase merges from archived copy |
| Secret retention in memory | Low | session-lifetime, never logged (extends Password Hygiene) |
| Prompt precedes a session manager | Low | contract-first; session manager consumes later |

## Rollback Plan

Revert the merge. Persisted `interactive` remotes stay readable via the same normalization rule; else delete `remotes.<name>` conf entries.

## Dependencies

- Archived `add-remote-command` implementation (already on main).

## Success Criteria

- [ ] Wizard offers three types; saved interactive remote has no `obfuscatedPassword`/`keyPath`
- [ ] Selection prompts each session; password never reaches disk/stdout/logs
- [ ] `bun run test`, `typecheck`, `lint` pass
