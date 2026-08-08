# host-dependency-check Specification

## Purpose

Detect and report whether the required **local** host tools (`ssh`, `git`, `docker`)
are installed on the machine running `tako doctor`. Print a version string or
"not found" for each tool and derive the command exit code. No SSH connection or
network call is made — this is a local-only pre-flight gate.

## Requirements

### Requirement: Required Tools Enumeration

The system MUST check a fixed, hard-coded set of required host tools: `ssh`, `git`,
and `docker`. The list SHALL be a domain-owned constant and MUST NOT be configurable
at runtime.

#### Scenario: Fixed tool set

- GIVEN the `tako doctor` command is invoked
- WHEN the host-dependency check runs
- THEN exactly three tools are checked: `ssh`, `git`, and `docker`

### Requirement: Local Presence Detection

For each required tool the system MUST determine whether the binary is available on
the local `PATH`. No SSH connection, network call, or remote probe SHALL be attempted.

#### Scenario: All tools present

- GIVEN `ssh`, `git`, and `docker` are installed and on `PATH`
- WHEN `tako doctor` runs
- THEN each tool is reported as found
- AND no network call or SSH connection is made

#### Scenario: A tool is missing

- GIVEN `docker` is not installed or not on `PATH`
- WHEN `tako doctor` runs
- THEN `docker` is reported as "not found"
- AND `ssh` and `git` are still checked independently

### Requirement: Version Capture

When a tool is present the system SHOULD capture its version string. When a tool is
absent the system MUST report "not found" in place of a version.

#### Scenario: Version captured for present tool

- GIVEN `git` is installed and responds to `git --version`
- WHEN `tako doctor` checks `git`
- THEN the git version string (e.g., `git version 2.43.0`) is included in the report

#### Scenario: No version for missing tool

- GIVEN `docker` is not installed
- WHEN `tako doctor` checks `docker`
- THEN the report shows "not found" instead of a version string

### Requirement: Exit Code Semantics

The command MUST exit `0` when every required tool is present and MUST exit `1` when
any required tool is missing.

#### Scenario: All present — exit 0

- GIVEN all three required tools are present
- WHEN `tako doctor` completes
- THEN the process exits with code `0`

#### Scenario: Any missing — exit 1

- GIVEN at least one required tool is missing
- WHEN `tako doctor` completes
- THEN the process exits with code `1`
- AND all remaining tools are still checked before exit

### Requirement: Report Output Format

The system MUST print a human-readable report to stdout with one line per tool. Each
line SHALL display a visual pass/fail marker and use color (via `picocolors`) to
convey status. The report MUST be plain text — no structured output formats are
required for this iteration.

#### Scenario: Success line rendering

- GIVEN `ssh` is present at a detected version
- WHEN the report line for `ssh` is printed
- THEN the line shows a success marker (green), the tool name, and its version

#### Scenario: Failure line rendering

- GIVEN `docker` is missing
- WHEN the report line for `docker` is printed
- THEN the line shows a failure marker (red), the tool name, and "not found"

#### Scenario: Report completeness

- GIVEN `tako doctor` has finished checking all tools
- THEN the report contains exactly one line per required tool
- AND no additional tools or sections appear

### Requirement: Port/Adapter Isolation

The application layer MUST declare a `HostToolChecker` port (interface). The
infrastructure layer MUST provide a `LocalHostToolChecker` adapter that probes the
local `PATH` via `Bun.spawn`. The application layer MUST NOT import `child_process`,
`Bun.spawn`, or any process-spawning API directly.

#### Scenario: Application depends on port, not adapter

- GIVEN the `system` domain is implemented
- WHEN source dependencies are analyzed
- THEN the application layer imports only the `HostToolChecker` port interface
- AND the `LocalHostToolChecker` adapter is the sole consumer of `Bun.spawn`

## Out of Scope

- Remote/server pre-flight (docker daemon, compose v2, caddy network, base services).
- Minimum-version comparison or semver parsing.
- `--json` output, fix suggestions, auto-install prompts.
- `docker compose` plugin detection.
- Configurable tool lists beyond the hard-coded constant.
