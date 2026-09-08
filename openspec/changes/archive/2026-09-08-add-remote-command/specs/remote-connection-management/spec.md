# remote-connection-management Specification

## Purpose

Register an SSH host for `tako` to manage. `tako remote add` (singular) launches an Ink (`@inkjs/ui`) wizard: collect details, validate the SSH connection with a **mandatory** hostkey check before saving, block duplicates, persist via `conf`. `local` is the implicit default, not registered here. Singular `remote` deviates from `docs/commands.md`'s `remotes` (ADR 0014).

## Requirements

### Requirement: Interactive Wizard Invocation

`tako remote add` MUST launch an `@inkjs/ui` Ink wizard and take no required positional argument; the name is collected in-form.

#### Scenario: Launch

- GIVEN the user runs `tako remote add`
- WHEN the command resolves
- THEN the wizard renders and prompts for the connection name

### Requirement: Field & Credential Collection

The wizard MUST collect name, username, host, port (default `22`), and type (`store` | `ssh-key`); `store` MUST ask whether to save the password (yes → obfuscate-and-persist, no → request each session); `ssh-key` MUST ask for the private-key path.

#### Scenario: store saves password

- GIVEN type `store` and save-password = yes
- WHEN the wizard completes
- THEN the password is captured for obfuscated persistence

#### Scenario: store transient password

- GIVEN type `store` and save-password = no
- WHEN saved
- THEN no password persists; it is requested on each later use

#### Scenario: ssh-key path

- GIVEN type `ssh-key`
- WHEN prompted
- THEN a private-key path is collected and used for auth

### Requirement: Pre-Save SSH Validation & Error Recovery

The system MUST open a working `ssh2` connection before saving (bounded `readyTimeout`); on failure it MUST re-show the form with a mapped message and MUST NOT save. Categories (auth, network, timeout, hostkey) map to distinct messages.

#### Scenario: valid — saves

- GIVEN the fields yield a working connection
- WHEN validation completes
- THEN the remote is persisted and the wizard exits `0`

#### Scenario: invalid — re-shows form

- GIVEN SSH auth is refused
- WHEN validation completes
- THEN the form re-shows with an auth-specific message; no save

### Requirement: Mandatory SSH Hostkey Verification

The hostkey MUST be verified during the test and MUST NOT be skippable, disableable, or bypassable by any flag. For a first-seen host the wizard MUST show the fingerprint and require explicit acceptance before saving.

#### Scenario: first-seen confirmation

- GIVEN the host is unknown to tako
- WHEN the test succeeds
- THEN the fingerprint is shown and save requires explicit acceptance

#### Scenario: no skip

- GIVEN any invocation
- WHEN the connection is tested
- THEN hostkey verification is enforced; no flag disables it

### Requirement: Duplicate Detection (Block)

A new remote whose name **or** `username@host:port` already exists MUST be blocked with no override; the wizard MUST show which key collided and keep the user in the form.

#### Scenario: name collision

- GIVEN remote `nas` exists
- WHEN the user enters name `nas`
- THEN save is blocked with a duplicate-name message

#### Scenario: user@host collision

- GIVEN `ops@10.0.0.5:22` exists
- WHEN the same user@host:port is entered under a new name
- THEN save is blocked despite the differing name

### Requirement: Exit Codes

`remote add` MUST exit `0` on save, `1` on validation failure, duplicate, hostkey rejection, or abort, and `2` on unexpected internal error.

#### Scenario: saved — 0

- GIVEN a remote is validated and persisted
- WHEN the wizard completes
- THEN the process exits `0`

#### Scenario: failure — 1

- GIVEN validation failure, duplicate, hostkey, or abort
- WHEN the wizard exits
- THEN the process exits `1`

### Requirement: Password Hygiene & Persistence

Saved passwords use `conf` `encryptionKey` obfuscation (NOT encryption) and MUST never reach stdout, stderr, or logs. The store MUST NOT be advertised as secure; the posture is isolated behind the `SecretVault` port for later replacement.

#### Scenario: password never logged

- GIVEN a password is saved
- WHEN any output renders
- THEN the password appears nowhere in stdout, stderr, or logs

### Requirement: Port/Adapter Isolation

The application layer MUST declare ports `RemoteRepository`, `SshConnectionTester`, `SecretVault`; infrastructure MUST provide the sole `ssh2`/`conf` adapters. Application and CLI MUST NOT import `ssh2` or `conf` directly.

#### Scenario: application depends on ports

- GIVEN the `remotes` domain is implemented
- WHEN dependencies are analyzed
- THEN only adapters consume `ssh2`/`conf`; use cases import ports only

## Security Posture

**v0 = obfuscation only, NOT encryption.** `conf`'s `encryptionKey` is reversible — secrets are recoverable from the installed binary. UI, help, and docs MUST NOT call this secure or encrypted. It is intentional debt behind the `SecretVault` port, replaceable later with no domain changes. Mandatory hostkey verification prevents silent MITM on add.

## Out of Scope

- `remote list | rm | use | test` subcommands.
- Master-passphrase / OS-keyring secrets (deferred behind `SecretVault`).
- Passphrase-protected private keys.
- `local` type UI/configuration (implicit default; surfaced in a future server list).
- `--json` / non-interactive flags; positional `remote add <name>` (name collected in-form).
- Re-verification of a previously stored hostkey (belongs to `remote test`).
