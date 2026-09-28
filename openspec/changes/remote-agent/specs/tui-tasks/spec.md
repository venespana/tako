# tui-tasks Specification

## Purpose

The per-server tasks area of the TUI: create, edit, and delete agent jobs; view execution history and results (including runs that happened while disconnected); and preview destructive jobs as dry runs before applying.

## Requirements

### Requirement: Per-Server Job Management

For the active remote with an installed agent, the TUI MUST provide job CRUD — list jobs, create a job (type, target stack, schedule), edit, and delete — persisted on the server through the agent transport.

#### Scenario: create

- GIVEN the active remote has an agent
- WHEN the user creates a nightly prune job
- THEN the job appears in the server's job list

#### Scenario: delete

- GIVEN a job exists on the server
- WHEN the user deletes it
- THEN it disappears from the list and from the server

### Requirement: Schedule Editing

The TUI MUST allow editing an existing job's cron schedule and persist the change server-side.

#### Scenario: edit schedule

- GIVEN a job scheduled nightly
- WHEN the user changes it to weekly
- THEN the server-side schedule is updated and reflected in the list

### Requirement: History and Results

The TUI MUST show per-job execution history with outcomes (success/failure) and result details, including runs executed while the client was disconnected (after reconcile).

#### Scenario: disconnected run visible

- GIVEN a job ran while the client was offline
- WHEN the user opens the job's history after reconnecting
- THEN that run and its result are listed

### Requirement: Dry-Run Preview

For destructive jobs the TUI MUST offer a dry-run preview showing the report of what would happen, with apply as a separate explicit action.

#### Scenario: preview before apply

- GIVEN a prune job
- WHEN the user selects dry-run preview
- THEN a report renders and nothing is removed until the user explicitly applies

### Requirement: Remote Workspace Entry Flow

The TUI MUST treat the tasks workspace (/tasks) as the active remote's own menu: selecting a remote MUST navigate directly into its workspace; when the agent is not reachable there, the TUI MUST offer an in-app install of the agent; and returning to the home menu MUST leave the remote context entirely.

#### Scenario: select enters the workspace

- GIVEN a configured remote
- WHEN the user selects it in the remotes list
- THEN the TUI activates it and navigates directly to its tasks workspace (no separate home-menu Tasks entry exists)

#### Scenario: unreachable agent offers in-TUI install

- GIVEN the selected remote's agent is not reachable
- WHEN the workspace shows the unreachable state
- THEN the TUI offers an install that runs the agent install command with its output streamed live, reconnects the workspace on success, and offers retry on failure

#### Scenario: home disconnects the remote

- GIVEN a connected agent session for the active remote
- WHEN the user returns to the home menu
- THEN the active remote selection is cleared and the agent session is closed

### Requirement: Session Header Shows Remote and Agent Version

The app shell MUST render the active remote below the logo (stacked, not beside it), showing `remote · agent <version> (active)` once the workspace handshake has reported the agent version and the remote name alone until then.

#### Scenario: version appears after handshake

- GIVEN a remote whose agent handshake has succeeded
- WHEN any screen of the session is shown
- THEN the header line under the logo names the remote with its agent version and an active marker

#### Scenario: name before handshake

- GIVEN a remote selected whose agent version is not yet known
- WHEN the header renders
- THEN only the remote name appears under the logo

## Out of Scope

- Cross-server bulk job management; job editing without an installed agent.
