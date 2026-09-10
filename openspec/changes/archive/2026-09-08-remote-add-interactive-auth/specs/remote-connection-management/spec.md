# Delta for remote-connection-management

## MODIFIED Requirements

### Requirement: Field & Credential Collection

The wizard MUST collect name, username, host, port (default `22`), and type (`store` | `ssh-key` | `interactive`). `store` MUST capture the password for obfuscated persistence — choosing `store` expresses save intent; the wizard MUST NOT offer a save-password "No" (per-session) branch. `ssh-key` MUST ask for the private-key path. `interactive` MUST collect a one-time password used solely for pre-save validation and MUST NOT persist any secret field.

(Previously: type was `store` | `ssh-key`, and `store` asked whether to save the password, with "no" meaning request-per-session.)

#### Scenario: store saves password

- GIVEN type `store`
- WHEN the wizard completes
- THEN the password is captured for obfuscated persistence

#### Scenario: ssh-key path

- GIVEN type `ssh-key`
- WHEN prompted
- THEN a private-key path is collected and used for auth

#### Scenario: interactive validation-only password

- GIVEN type `interactive`
- WHEN the wizard completes
- THEN the entered password was used only to validate the connection and the persisted remote carries no `obfuscatedPassword` or `keyPath`

#### Scenario: transient store is not creatable

- GIVEN the wizard's type step
- WHEN the credential-type options render
- THEN exactly three types are offered and none creates a `store` remote without a saved password

## ADDED Requirements

### Requirement: Remote Lookup by Name

`RemoteRepository` MUST provide an exact-name lookup that returns the full persisted `Remote` (including `credentialType`) or a distinct not-found outcome; connect-time flows MUST use this port rather than re-reading conf.

#### Scenario: found

- GIVEN remote `nas` is persisted
- WHEN `getByName('nas')` is called
- THEN the full `Remote` record is returned

#### Scenario: not found

- GIVEN no remote named `ghost`
- WHEN `getByName('ghost')` is called
- THEN a not-found outcome is returned without throwing

### Requirement: Legacy Transient-Store Normalization

A persisted remote with `credentialType: 'store'` and no `obfuscatedPassword` MUST be treated at read time as `interactive` (connect-time prompt; no secret expected on disk); normalization MUST NOT rewrite the persisted entry.

#### Scenario: legacy remote prompts

- GIVEN a pre-existing `store` remote without `obfuscatedPassword`
- WHEN it is read and selected
- THEN it behaves as `interactive` (see remote-interactive-auth)

#### Scenario: persisted bytes unchanged

- GIVEN a legacy `store` remote
- WHEN reads occur
- THEN the stored `credentialType` remains `store` (no migration write)
