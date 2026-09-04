# Delta for host-dependency-check

## ADDED Requirements

### Requirement: Dual Invocation

The doctor diagnostic MUST be one shared screen rendered identically by the
standalone `tako doctor` CLI command and the TUI `/doctor` route. Only the
standalone CLI path SHALL map the check result to a process exit code.

#### Scenario: Standalone CLI invocation

- GIVEN `tako doctor` is invoked from a terminal
- WHEN the check completes
- THEN the shared doctor screen is rendered
- AND the process exits with the appropriate code (`0`/`1`)

#### Scenario: TUI route invocation

- GIVEN the TUI is running
- WHEN the user navigates to `/doctor`
- THEN the same shared doctor screen is rendered
- AND no process exit code is derived

## MODIFIED Requirements

### Requirement: Required Tools Enumeration

The system MUST check a fixed set of five required host tools: `ssh`, `ssl`,
`git`, `docker`, `docker-compose`. The list SHALL be a domain-owned constant and
MUST NOT be configurable at runtime.
(Previously: three tools — `ssh`, `git`, `docker`.)

#### Scenario: Fixed tool set

- GIVEN the `tako doctor` command is invoked
- WHEN the host-dependency check runs
- THEN exactly five tools are checked: `ssh`, `ssl`, `git`, `docker`, `docker-compose`

#### Scenario: Compose independent of docker

- GIVEN `docker` is installed but `docker-compose` is not on `PATH`
- WHEN the check runs
- THEN `docker` is recorded present and `docker-compose` missing

### Requirement: Local Presence Detection

For each required tool the system MUST determine whether the binary is available
on the local `PATH`. No SSH connection, network call, or remote probe SHALL be
attempted.

#### Scenario: All tools present

- GIVEN all five required tools are installed and on `PATH`
- WHEN `tako doctor` runs
- THEN each tool is recorded present in the check result
- AND no network call or SSH connection is made

#### Scenario: A tool is missing

- GIVEN `docker` is not installed or not on `PATH`
- WHEN `tako doctor` runs
- THEN `docker` is recorded as "not found"
- AND the remaining tools are still checked independently

### Requirement: Version Capture

When a tool is present the system SHOULD capture its version string in the check
result. When a tool is absent the system MUST record "not found" in place of a
version. Present-tool versions MUST be displayed in the report.
(Previously: version string printed in each present tool's report line.)

#### Scenario: Version captured for present tool

- GIVEN `git` is installed and responds to `git --version`
- WHEN the check runs
- THEN the version string is captured in the check result

#### Scenario: No version for missing tool

- GIVEN `docker` is not installed
- WHEN the check runs
- THEN the result records "not found" instead of a version

### Requirement: Exit Code Semantics

The standalone `tako doctor` command MUST exit `0` when every required tool is
present and MUST exit `1` when any required tool is missing. The TUI `/doctor`
path MUST NOT derive an exit code.
(Previously: unscoped single path; scenarios counted three tools.)

#### Scenario: All present — exit 0

- GIVEN all five required tools are present
- WHEN standalone `tako doctor` completes
- THEN the process exits with code `0`

#### Scenario: Any missing — exit 1

- GIVEN at least one required tool is missing
- WHEN standalone `tako doctor` completes
- THEN the process exits with code `1`
- AND all remaining tools are still checked before exit

### Requirement: Report Output Format

The system MUST render a report that shows ALL required tools with their status
and version when present, or "not found" when absent. Each tool is displayed
with a pass/fail marker (✓/✖), tool name, and version or not-found indication.
A summary line and overall status (Ok/Failed/Degraded) MUST also be shown.
(Previously: missing-only report with no per-tool entries.)

#### Scenario: All tools shown with status

- GIVEN `tako doctor` is invoked
- WHEN the check completes
- THEN every required tool is listed with its status:
  - Present tools: ✓ marker, tool name, and version
  - Missing tools: ✖ marker, tool name, and "not found"
- AND a summary line shows: "Summary: X passed, X failed, X warnings"
- AND an overall status line shows: "Status: Ok|Failed|Degraded"

#### Scenario: All-present satisfied state

- GIVEN all five required tools are present
- WHEN the doctor screen renders
- THEN all five tools are shown with ✓ markers and versions
- AND the status is "Ok"

#### Scenario: All-missing degraded state

- GIVEN all five required tools are missing
- WHEN the doctor screen renders
- THEN all five tools are shown with ✖ markers
- AND the status is "Failed"

#### Scenario: Partial failure degraded state

- GIVEN some tools are present and some missing
- WHEN the doctor screen renders
- THEN all tools are shown with appropriate markers
- AND the status is "Degraded"
