# ADR 0014: `tako remote add` — singular naming, v0 secrets posture, and managed cli→tui exception

## Status

Accepted

## Context

The `add-remote-command` SDD introduced a new `remotes` domain with an interactive wizard for adding SSH connection configurations. Several decisions emerged from the spec/design that warrant explicit architectural documentation:

1. **Command naming**: `docs/commands.md` defines `remotes add` (plural) as the closed contract. The implementation uses `tako remote add` (singular).

2. **Secrets posture**: Passwords are stored using `conf`'s reversible obfuscation, not encryption. This is intentional v0 debt.

3. **Mandatory hostkey verification**: First-seen hosts must have their fingerprint explicitly accepted before saving.

4. **cli→tui import exception**: The architecture forbids `cli/*` from importing `tui/*`, but interactive commands need to render a TUI wizard.

## Decision

### 1. Singular `remote add` (deviation from closed contract)

`tako remote add` uses singular `remote` (not `remotes add`). This matches the widely-understood convention of `git remote add`, `docker context create`, etc.

- The closed contract in `docs/commands.md` specified `remotes <add|list|rm|use|test>`.
- The implementation deviates: `remote add` (singular) collects the name in-form rather than as a positional argument.
- ADR records this as an accepted deviation. Future work may reconcile if a `remotes` plural command emerges.

### 2. v0 Secrets — obfuscation only, NOT encryption

`SecretVault.obfuscate()` uses `conf`'s reversible `encryptionKey` (AES-256-CBC). This is **NOT secure encryption**:

- Secrets are recoverable from the binary.
- The UI, help text, and documentation MUST NOT say "secure", "encrypted", or "safe".
- This is intentional v0 debt, isolated behind the `SecretVault` port interface.
- A future version (v1) may swap in OS keyring, master passphrase, or another solution with zero domain changes.

### 3. Mandatory SSH Hostkey Verification

During `ssh2` connection establishment, the hostkey is captured via `hostVerifier` and presented to the user as a SHA256 fingerprint. Save is blocked until the user explicitly accepts.

- No `--yes` or `--trust` flag bypasses this.
- For known hosts (future `remote test` command), the fingerprint is pre-verified.
- MITM risk on first-seen hosts remains (TOFU) and is documented.

### 4. Managed cli→tui Exception

`src/cli/commands/remote-add.ts` imports `runAddRemoteWizard` from `src/tui/features/remotes/add-remote-wizard/run.ts`.

- `architecture.md` (ADR 0010) forbids `cli/*` → `tui/*` imports.
- This is a **managed exception** for interactive commands that must render a TUI.
- The exception is narrow: only the wizard entry point (`run.ts`) is imported; no TUI component logic leaks into CLI.
- If a future CLI command also needs interactive UI, it uses the same pattern.

## Consequences

- (+/) Deviation from `docs/commands.md` is documented and accepted.
- (+/) Secrets debt is isolated and documented; can be replaced without domain changes.
- (+/) Hostkey TOFU is enforced; users cannot silently accept unknown hosts.
- (+/) Interactive commands can render TUI without breaking architecture rules.
- (-) Users may expect "secure" storage; documentation must be explicit that it is not.
- (-) cli→tui exception adds a dependency direction that violates the letter of ADR 0010.

## References

- Spec: `openspec/changes/add-remote-command/specs/remote-connection-management/spec.md`
- Design: `openspec/changes/add-remote-command/design.md`
- ADR 0010: FSD + Clean Arch + shared kernel architecture
