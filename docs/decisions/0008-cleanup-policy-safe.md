# ADR 0008: Safe cleanup policy

## Status

Accepted

## Context

Periodic docker cleanup is necessary to avoid filling the disk. But `docker image prune -af` deletes ALL currently unused images, which breaks the ability to rollback to previous versions.

## Decision

**Safe prune policy**:

- ✅ `docker container prune -f` (stopped containers).
- ✅ `docker image prune -f` (only **dangling** images `<none>:<none>`).
- ✅ `docker builder prune -f` (unused build cache).
- ❌ **NEVER** `docker image prune -af` (breaks rollback).
- ❌ **NEVER** `docker volume prune` (deletes persistent data).

## Consequences

- (+) Tagged images retained, rollback possible.
- (+) Persistent data safe.
- (+) Safe operation for unattended cron.
- (-) Higher disk usage in the long run (mitigated with one-off manual `-af` when needed).
- (-) Build cache can grow if there is heavy active development.
