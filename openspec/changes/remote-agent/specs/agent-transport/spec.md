# agent-transport Specification

## Purpose

Communication between the Tako client and the server-side agent: a `Transport` port abstraction with an SSH multiplexed-channel adapter, a line-delimited JSON protocol (requests, responses, push events), a version handshake, and SSH-identity authentication.

## Requirements

### Requirement: Transport Port Abstraction

Client-side agent communication MUST be declared as a `Transport` port in the application layer. The SSH adapter MUST be the sole v0 implementation; a relay/tunnel transport MAY be added later without changing domain or application code.

#### Scenario: application depends on the port

- GIVEN the agent client is implemented
- WHEN dependencies are analyzed
- THEN agent use cases import the `Transport` port only, never an SSH implementation

### Requirement: SSH Multiplexed Channel

The SSH adapter MUST carry all client–agent traffic over a single multiplexed channel of one authenticated SSH connection to the agent host, supporting concurrent in-flight operations.

#### Scenario: concurrent operations

- GIVEN a connected transport
- WHEN two requests are in flight
- THEN both complete over the single channel without one blocking the other

### Requirement: Line-Delimited JSON Framing

Protocol messages MUST be framed as newline-delimited JSON. Requests carry a correlation identifier; responses reference it; the agent MAY push events (e.g. job state changes) not tied to any request.

#### Scenario: request/response

- GIVEN a connected transport
- WHEN the client sends a request
- THEN a response arrives referencing the request's correlation identifier

#### Scenario: push event

- GIVEN an agent-side job changes state
- WHEN the agent emits the event
- THEN the client receives it without having sent a matching request

### Requirement: Version Handshake

On connect, client and agent MUST exchange versions. A mismatch MUST produce a warning but MUST NOT block the session or trigger automatic upgrade; upgrading the agent happens only by explicit user action.

#### Scenario: versions match

- GIVEN client and agent run the same version
- WHEN the handshake completes
- THEN the session proceeds with no warning

#### Scenario: mismatch warns

- GIVEN the agent is older than the client
- WHEN the handshake completes
- THEN a warning is shown, the session continues, and no automatic upgrade occurs

### Requirement: SSH-Identity Authentication

The agent channel MUST authenticate solely through the established SSH connection's identity; the protocol MUST NOT introduce a separate token or credential in v0.

#### Scenario: no extra credential

- GIVEN a remote already authenticated over SSH
- WHEN the agent transport connects
- THEN no additional secret is requested or configured

## Out of Scope

- Relay/tunnel transport; auto-upgrade; log streaming.
