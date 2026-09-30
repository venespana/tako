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
- THEN the TUI offers an install that runs the install pipeline in-process (no child process) with its output streamed live, reconnects the workspace on success, and offers retry on failure

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

### Requirement: Footer-Only Key Hints

All key hints MUST render exclusively in the footer bar, ordered left-to-right as declared per page, with `back` and `quit` always last. Page bodies MUST NOT embed key instructions. While a form is open, the footer MUST suppress `back`/`quit` (character keys are data entry; Esc is the only cancel).

#### Scenario: back and quit always last

- GIVEN any page with key hints
- WHEN the footer renders
- THEN every hint appears in the footer bar in declared order and `back` and `quit` are the last two hints

#### Scenario: no key instructions in page bodies

- GIVEN the tasks workspace shows an empty job list
- WHEN the body renders
- THEN it shows only the state ("No jobs yet") and the creation hint lives in the footer, not the body

#### Scenario: form mode suppresses back and quit

- GIVEN a job form is open
- WHEN the footer renders
- THEN `back` and `quit` are absent, character keys reach the input as data, and Esc is the only cancel

### Requirement: Progressive Job Form

The job form MUST follow the wizard pattern: one field at a time, the first field focused on entry, Enter confirming each step, and completed fields collapsing above the active one.

#### Scenario: first field focused on entry

- GIVEN the user opens the job form
- WHEN it renders
- THEN the first field (id) is the single active prompt

#### Scenario: enter confirms each step

- GIVEN the job form is mid-flow
- WHEN the user confirms a field with Enter
- THEN that field collapses as completed and the next field becomes the active prompt

#### Scenario: completed fields collapse

- GIVEN the job form has confirmed fields
- WHEN a later field is active
- THEN earlier fields render as collapsed summaries, not editable prompts

### Requirement: In-Process Install from the Workspace

The tasks workspace's install MUST run the same install pipeline as the CLI, in-process (no child process), streaming each progress line into the install panel; the session password MUST travel as connection material only (never argv, never environment).

#### Scenario: same pipeline as the CLI

- GIVEN the agent is not installed on the active remote
- WHEN the user starts the install from the workspace
- THEN the install runs in-process through the same pipeline the CLI uses, with its progress lines streamed live into the panel

#### Scenario: session password is connection material only

- GIVEN an interactive-credential remote with a session password held by the TUI
- WHEN the in-process install runs
- THEN the password is passed as connection material inside the process and never appears in argv or environment variables

## Out of Scope

- Cross-server bulk job management; job editing without an installed agent.
