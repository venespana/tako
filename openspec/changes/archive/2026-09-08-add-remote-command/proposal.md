# Proposal: `tako remote add` — host trust & prompt relaying (v2)

> Change `add-remote-command` · Store hybrid · Phase propose v2 · supersedes v1 (shipped, PR #2) · builds on `exploration.md` v2, Approach 2.

## Intent

PR #2 auto-accepts hostkeys: credentials reach an unverified host before any trust question, fingerprints are never persisted, keyboard-interactive-only servers fail as `auth`. v2: TOFU trust gates credential transmission; relay in-flight SSH prompts.

## Scope

### In Scope

- `HostKeyStore` port + `ConfHostKeyStore` adapter (conf `knownHosts`, TOFU).
- Hostkey prompt in TUI only when `hostVerifier` fires on an unknown host; accept persists fingerprint; known+match → silent.
- Mismatch → hard block: terminal screen, no override, exit 1.
- Keyboard-interactive relay (`tryKeyboard`, multi-round, hidden `echo:false` input); answers never logged.
- Single-pass `AddRemote.execute` (collapse probe/save split).
- Pause `readyTimeout` during prompts; abort resolves `verify`/`finish` + `end()`.

### Out of Scope

- `~/.ssh/known_hosts` interop; passphrase keys; `change-password` relay (mechanism stays extensible).
- First-connect MITM proof (inherent TOFU limit; documented).
- v1 deferrals: other `remote` subcommands, master-passphrase vault, `--json`.

## Capabilities

### New Capabilities

- `remote-connection-management` (delta drafted, un-archived): sdd-spec revises it in place — pre-auth TOFU hostkey requirement, new prompt-relay requirement, `HostKeyStore` in Port/Adapter isolation, drop the "Re-verification of a previously stored hostkey" out-of-scope line.

### Modified Capabilities

- None.

## Approach

`test(config, handlers)`: `onHostkeyPrompt(fingerprint) → Promise<boolean>`, `onKeyboardInteractive(prompts) → Promise<string[]>`. Adapter's `hostVerifier` checks `HostKeyStore`: match → silent verify; mismatch → terminal fail; unknown → await TUI answer. One wizard pending-prompt state serves both prompt kinds.

**Decisions (2026-09-08):** ask only when SSH requests it; yes/no via TUI, never raw stdin; conf-namespaced HostKeyStore; mismatch = hard block. Derived: known-host re-add skips silently.

## Stays vs Changes (vs PR #2)

**Stays:** D1–D8, wizard steps, duplicate block, conf persistence + password hygiene, exit codes, `RemoteRepository`/`SecretVault`, remaining spec requirements unchanged.

**Changes:** `SshConnectionTester` signature + handler threading; adapter relays (was auto-accept), wires `tryKeyboard`, prompt-aware timeout; new `HostKeyStore`/`ConfHostKeyStore`; wizard pending-prompt state, mismatch terminal step, OpenSSH-style wording; `remote-add.ts` composition.

## Affected Areas

- `src/domains/remotes/` (Mod/New) — relay types; handler-based `test()`; `HostKeyStore` port; `ConfHostKeyStore` adapter.
- `src/tui/features/remotes/add-remote-wizard/` (Mod) — pending-prompt state; relay step; mismatch screen.
- `src/cli/commands/remote-add.ts` (Mod) — compose `ConfHostKeyStore`.

## Risks

- Timeout/abort during prompt; ssh2↔Ink async bridge (Med) — pause `readyTimeout`; always resolve callbacks + `end()`; one pending state.
- Multi-round prompts; answer leakage (Med) — prompt loop; hygiene extends to relayed answers.
- Port-signature test churn, ~4 suites (High) — mechanical fake updates.
- First-connect MITM (Med) — inherent TOFU limit; ADR; mismatch hard-blocked.

## Rollback Plan

`git revert` restores PR #2 behavior; conf `knownHosts` entries are inert (optionally purge). No host state, compose files, or templates touched.

## Dependencies

None new (ssh2 1.17, conf already in use).

## Success Criteria

- [ ] Unknown host: prompt before credentials; decline → exit 1, no auth.
- [ ] Accept persists fingerprint; re-add silent, saves.
- [ ] Mismatch → terminal block, exit 1.
- [ ] Keyboard-interactive-only server saves; answers never logged.
- [ ] Ctrl+C/timeout during prompts clean; `test|typecheck|lint|build` green.
