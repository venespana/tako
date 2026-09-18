# remote-agent-install Specification

## Purpose

Provision and remove Tako's persistent user-level agent on a managed Linux host over SSH (`agent` family, per decision record, ADR-0014 precedent): hybrid distribution, `systemd --user` unit with linger, empirical survive-disconnect verification, uninstall.

## Requirements

### Requirement: Hybrid Binary Distribution

`tako agent install` MUST map `uname -m` to an asset arch (`x86_64`→x64, `aarch64`→arm64). On arch match it MUST copy the client binary to `~/.tako/tako` and verify by post-copy sha256 against the local binary. On mismatch it MUST fall back to the per-arch GitHub Releases asset with checksum verification; when neither path works it MUST fail explicitly, naming the arch and paths attempted.

#### Scenario: copy path

- GIVEN client and server are both x64
- WHEN install runs
- THEN the binary is copied to `~/.tako/tako` with matching remote/local sha256

#### Scenario: arch mismatch falls back to Releases

- GIVEN an x64 client and an arm64 server (`uname -m` = `aarch64`)
- WHEN install runs
- THEN the linux-arm64 release asset is downloaded and checksum-verified on the server

#### Scenario: explicit failure

- GIVEN an arch mismatch and no usable release asset (missing or no egress)
- WHEN install runs
- THEN install fails explicitly, naming the arch and attempted paths

### Requirement: Release Asset Prerequisites

The release pipeline MUST publish per-arch Linux assets (x64, arm64). The release-trigger contradiction (ADR-0006 tag push vs auto-release on merge) MUST be resolved by decision record before the fallback ships.

#### Scenario: per-arch assets

- GIVEN a release is published
- THEN linux x64 and linux arm64 assets both exist

#### Scenario: trigger resolved

- GIVEN the release workflow runs
- THEN one documented trigger produces releases, per the resolving ADR

### Requirement: systemd User Unit and Linger

Install MUST operate at user level (no root): install and start a `systemd --user` unit under `~/.config/systemd/user/`, enable linger, and record whether Tako enabled linger. It MUST detect `KillUserProcesses=yes`, refuse hosts without systemd, and report a polkit linger denial with an actionable message.

#### Scenario: unit and linger enabled

- GIVEN a systemd host without linger
- WHEN install completes
- THEN the unit is active and linger enabled, recorded as Tako-enabled

#### Scenario: linger pre-existing

- GIVEN linger was already enabled before install
- WHEN install completes
- THEN linger remains enabled, recorded as not Tako-enabled

#### Scenario: non-systemd refusal

- GIVEN a host without systemd
- WHEN install runs
- THEN it refuses cleanly, changing nothing

#### Scenario: KillUserProcesses detected

- GIVEN `KillUserProcesses=yes` on the host
- WHEN install runs
- THEN it is detected and reported, and the probe still executes

#### Scenario: polkit denial

- GIVEN `loginctl enable-linger` is denied by polkit
- WHEN install runs
- THEN the error explains the denial and remedy

### Requirement: Mandatory Survive-Disconnect Probe

Install MUST NOT report success until an empirical probe passes: the installing session disconnects and a second, independent SSH connection verifies the unit still active under the lingered user manager. The probe MUST pass on x64 and arm64 hosts.

#### Scenario: probe passes

- GIVEN the unit is installed and running
- WHEN the first session disconnects and the probe inspects via a second SSH connection
- THEN the unit is still active and install reports success

#### Scenario: probe fails

- GIVEN the unit died with the session
- WHEN the probe inspects via a second SSH connection
- THEN install reports failure with diagnostics, never success

### Requirement: Uninstall

Uninstall MUST stop and remove the user unit, disable linger only when Tako enabled it, and delete `~/.tako/` — no residue.

#### Scenario: full uninstall

- GIVEN an agent installed by Tako
- WHEN uninstall runs
- THEN the unit is gone, linger is disabled, and `~/.tako/` is deleted

#### Scenario: pre-existing linger preserved

- GIVEN linger was enabled before install
- WHEN uninstall runs
- THEN the unit and `~/.tako/` are removed but linger stays enabled
