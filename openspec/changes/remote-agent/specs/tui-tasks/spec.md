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

## Out of Scope

- Cross-server bulk job management; job editing without an installed agent.
