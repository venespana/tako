# Exploration: remote-add-command

## Current State

The `remote add` feature is **largely already implemented** across all layers:

- **Domain** (`src/domains/remotes/`): `Remote`/`RemoteDraft` types, `AddRemote` use case (duplicate check → SSH validation → hostkey gate → persist), `ValidateSshConnection`, `CheckDuplicateRemote`, `SecretVault`, `RemoteRepository` port, `Ssh2ConnectionTester` adapter, `ConfRemoteRepository`/`ConfSecretVault` infra. Full test coverage co-located.
- **TUI wizard** (`src/tui/features/remotes/add-remote-wizard/`): Zustand-driven multi-step wizard with steps `name → user → host → port (default 22) → type → (save-password | key-path) → password → validating → hostkey-confirm → done`. Uses `@inkjs/ui` TextInput/Select/PasswordInput/ConfirmInput. Hostkey prompt is a yes/no ConfirmInput showing the fingerprint.
- **TUI pages/routes**: `RemotesMenuPage` at `/remotes` redirects to `/remotes/add` when zero remotes are configured (`onEmpty: () => navigate('/remotes/add')` — requirement 1 satisfied). `RemotesAddPage` embeds the wizard with fresh state per entry. Routes exist for `add/list/rm/use/test/menu`.
- **CLI**: `src/cli/commands/remote-add.ts` runs the same wizard (`runAddRemoteWizard`). `docs/commands.md` documents the closed 9-command contract including `tako remote add`.

## Gap Analysis vs. Feature Request

| Requested | Status |
|---|---|
| Empty remotes → show add route | ✅ Implemented (`RemotesMenuPage.onEmpty`) |
| Form: name, user, host, port (default 22) | ✅ Implemented |
| Auth method: password, key, **interactive** | ⚠️ Only `store` and `ssh-key` exist. The "save password? No — ask each session" branch approximates interactive, but there is no explicit `interactive` credential type. Open question: how a session-recquired password is supplied on later connections (no prompt-on-connect flow exists in this repo slice). |
| Test connection with info/errors | ✅ Implemented (`validating` step, categorized errors, error→step remap) |
| Yes/no selector for hostkey/SSH prompt | ✅ Implemented (`HostkeyConfirmStep` with `ConfirmInput`) |

## Affected Areas

- `src/domains/remotes/domain/types.ts` — add `interactive` to `SshCredentialType` (or decide the existing `store + savePassword:false` covers it)
- `src/domains/remotes/application/AddRemote.ts` — map the new credential type in validation auth dispatch
- `src/tui/features/remotes/add-remote-wizard/model/wizard-store.ts` — new branch in `setType` step routing
- `src/tui/features/remotes/add-remote-wizard/ui/AddRemoteWizard.tsx` — new option label in `TypeStep`
- `src/domains/remotes/infrastructure/Ssh2ConnectionTester.ts` — interactive password supply at connect time (if a real interactive flow is wanted)
- `src/tui/pages/remotes-use/` + App runtime — how a stored-without-password remote prompts at session start

## Approaches

1. **Formalize `interactive` as a third credential type**
   - Pros: matches the feature request literally; explicit UX ("asks password always"); no ambiguity between "store/skip save" and "never store".
   - Cons: touches domain types, all three consumers of `SshCredentialType`, plus a new prompt-on-connect flow in the TUI/CLI session bootstrap. Persistence of a passwordless remote must be validated against `ConfRemoteRepository` and `remotes use`/session logic.
   - Effort: Medium

2. **Reuse existing `store` + `savePassword: false` as "interactive" (relabel only)**
   - Pros: near-zero code change; the wizard already supports "ask each session".
   - Cons: semantics conflate "stored credential with skip-save" with "never store"; doesn't address where the password comes from on later sessions if no prompt-on-connect flow exists; request explicitly asks for a third auth method.
   - Effort: Low

## Recommendation

Approach 1 (formal `interactive` type), **but first verify whether a prompt-on-connect flow already exists** in the session/connection bootstrap (`app-runtime`, `remotes-use`, SSH exec adapters). If the "ask each session" branch already prompts at connect time, Approach 2's gap is only labeling and Approach 1 collapses to a small rename/option addition. The exploration found no password prompt at connect time in the reviewed slice — that is the real work item either way.

## Risks

- Password supply at connect time for non-stored credentials may not exist yet — an `interactive` type without it is a dead end for the user.
- Domain type widening ripples into `ConfRemoteRepository` serialization and duplicate/endpoint checks.
- docs/commands.md declares a closed command contract; UI-only changes are safe, but any semantic change to stored remote shape needs a spec delta.

## Ready for Proposal

Yes — scoped as: add explicit `interactive` auth method (or relabel existing), plus (if missing) a connect-time password prompt flow.
