# agent-jobs Specification

## Purpose

The server-side job engine (`tako agent run`): a durable queue persisted with `bun:sqlite`, cron scheduling, a run-missed-once policy, idempotent job identity, reconcile-on-connect state sync, and the v0 job taxonomy (stack lifecycle, safe prune, server-config stub).

## Requirements

### Requirement: Durable Job Persistence

The agent MUST persist jobs, schedules, and execution state in SQLite via `bun:sqlite`, permitted as an agent-mode-only exception to the Node-20 compatibility rule (ADR-0011 amendment). State MUST survive agent restarts.

#### Scenario: survive restart

- GIVEN queued jobs and history exist
- WHEN the agent process restarts
- THEN jobs and history are intact from persistence

### Requirement: Cron Scheduling

Job schedules MUST accept cron expressions. Due jobs MUST execute on the server while the client is disconnected.

#### Scenario: disconnected execution

- GIVEN a prune job scheduled nightly
- WHEN the schedule fires with no client connected
- THEN the job executes on the server

### Requirement: Missed Runs Execute Once

When the agent resumes (restart or reconnect), each job that missed one or more firings while it was down MUST run exactly once — never once per missed occurrence.

#### Scenario: catch-up once

- GIVEN a job missed three firings while the agent was down
- WHEN the agent restarts
- THEN the job runs exactly once

### Requirement: Idempotent Job Identity

Job IDs MUST be idempotent: submitting a job whose ID already exists MUST update or acknowledge it, never duplicate it.

#### Scenario: duplicate submit

- GIVEN a job with ID `nas-prune` exists
- WHEN the client submits `nas-prune` again
- THEN exactly one job with that ID remains

### Requirement: Reconcile on Connect

On client connect, agent and client MUST reconcile job state: results and history produced while disconnected are delivered, and both sides converge on last-known state.

#### Scenario: sync after disconnect

- GIVEN a job ran while the client was disconnected
- WHEN the client connects
- THEN that run's result and updated history are delivered to the client

### Requirement: Stack Lifecycle Jobs

The taxonomy MUST include compose stack lifecycle operations: `up`, `down`, `pull`, `restart`.

#### Scenario: scheduled lifecycle op

- GIVEN a nightly `pull` then `up` job for a stack
- WHEN it fires
- THEN images are pulled and the stack is brought up

### Requirement: Safe Prune Jobs

Prune jobs MUST limit scopes to stopped containers, dangling images, and build cache per ADR-0008. The domain MUST reject any all-images prune (`image prune -af`) and any volume prune; enforcement MUST NOT depend on the UI.

#### Scenario: safe scopes execute

- GIVEN a prune job scoped to stopped containers and dangling images
- WHEN it runs
- THEN only stopped containers and dangling images are removed

#### Scenario: forbidden scope rejected

- GIVEN a prune definition requesting volume prune or `image prune -af`
- WHEN it is submitted or loaded
- THEN the domain layer rejects it

### Requirement: Dry-Run-First Destructive Jobs

Destructive jobs (prune) MUST support dry-run: a dry run produces a report of what would happen, and application is a separate step gated on that report mechanism.

#### Scenario: dry-run report

- GIVEN a prune job
- WHEN a dry run executes
- THEN a report lists what would be removed and nothing is removed

#### Scenario: apply after report

- GIVEN a reviewed dry-run report
- WHEN the job is applied (explicitly or on schedule)
- THEN the same scope is executed and the result recorded

### Requirement: Server-Config Stub

The job type `server-config` MUST exist as a declared stub: present in the taxonomy but not executable in v0.

#### Scenario: stub not executable

- GIVEN a `server-config` job
- WHEN it is due
- THEN it reports not-supported instead of executing

## Out of Scope

- Server-config job execution; log streaming; job concurrency policies.
