# Delta for remote-connection-management

## ADDED Requirements

### Requirement: Remote Execution Channel

The system MUST expose remote command execution as an application-layer port: run a command on a registered remote and capture stdout, stderr, and exit status. Infrastructure MUST implement it over the existing `ssh2` adapter.

#### Scenario: exec via port

- GIVEN a registered remote with a working connection
- WHEN a use case executes a command through the execution port
- THEN stdout, stderr, and exit status are returned

### Requirement: Remote File Transfer

The system MUST expose file upload/download as an application-layer port (SFTP-backed) with an integrity check on transferred bytes.

#### Scenario: upload with integrity

- GIVEN a local file
- WHEN it is uploaded through the transfer port
- THEN the remote bytes match the local file's checksum

### Requirement: Multiplexed Channels over One Connection

The adapter MUST support multiple concurrent channels (execution, transfer, agent transport) multiplexed over a single authenticated SSH connection to a host.

#### Scenario: concurrent channels

- GIVEN an open authenticated connection
- WHEN an execution and a transfer run simultaneously
- THEN both complete over the same connection

## MODIFIED Requirements

### Requirement: Port/Adapter Isolation

The application layer MUST declare ports `RemoteRepository`, `SshConnectionTester`, `SecretVault`, plus ports for remote command execution, file transfer, and multiplexed agent channel transport; infrastructure MUST provide the sole `ssh2`/`conf` adapters. Application and CLI MUST NOT import `ssh2` or `conf` directly.

(Previously: ports were `RemoteRepository`, `SshConnectionTester`, `SecretVault` only; the ssh2 adapter had no exec/SFTP/multiplexed channel capability.)

#### Scenario: application depends on ports

- GIVEN the `remotes` domain is implemented
- WHEN dependencies are analyzed
- THEN only adapters consume `ssh2`/`conf`; use cases import ports only

#### Scenario: channels behind ports

- GIVEN exec, SFTP, and multiplexed channels are implemented
- WHEN dependencies are analyzed
- THEN agent and remote use cases reach them only through ports, never `ssh2` directly
