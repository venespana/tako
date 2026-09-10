# remote-interactive-auth Specification

## Purpose

Password authentication for remotes that never persist a secret: the password is typed at every connection attempt, validated before the remote becomes active, and held only in session memory. Owns the connect-time prompt; `remote-connection-management` owns the wizard and persistence.

## Requirements

### Requirement: Connect-Time Password Prompt

When a remote requiring a password not available on disk is selected (credentialType `interactive`, or a legacy `store` remote without `obfuscatedPassword`), the system MUST prompt at selection time, MUST mask the input, and MUST validate the password via a real SSH connection attempt before the remote becomes active.

#### Scenario: selection prompts

- GIVEN a saved remote with credentialType `interactive`
- WHEN the user selects it in the remotes menu
- THEN a masked password prompt renders before the remote activates

#### Scenario: wrong password

- GIVEN the selection-time prompt is shown
- WHEN the entered password fails SSH auth
- THEN the prompt re-shows with an auth-specific message and the remote stays inactive

#### Scenario: cancel returns to list

- GIVEN the selection-time prompt is shown
- WHEN the user aborts it
- THEN the remote is not activated and the selection list is restored

#### Scenario: non-interactive selection skips prompt

- GIVEN a remote with credentialType `ssh-key` or a `store` remote with a stored password
- WHEN the user selects it
- THEN no password prompt renders

### Requirement: Memory-Only Secret Retention

A connect-time password MUST live in process memory for the session lifetime only and MUST NOT reach disk, conf, stdout, stderr, or logs (extends the Password Hygiene posture of `remote-connection-management`).

#### Scenario: nothing persisted

- GIVEN an interactive remote was selected and used
- WHEN storage and output are inspected after the session
- THEN no password material exists on disk or in logs

### Requirement: Re-Prompt Every Connection Attempt

The system MUST re-collect the password on every new connection attempt and MUST NOT reuse a password across sessions.

#### Scenario: next session prompts again

- GIVEN an interactive remote was used in an earlier session
- WHEN a new session selects the same remote
- THEN the password prompt renders again
