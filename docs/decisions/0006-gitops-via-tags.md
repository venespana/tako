# ADR 0006: GitOps via tags

## Status

Accepted

## Context

Deploy on push to the main branch is noisy: every in-progress commit gets deployed, even if it is not ready. We wanted deliberate deploys.

## Decision

**Deploy on tag push** (`v*` pattern), not on push to main. Tag = release = deploy. GitHub Actions workflow triggers on `on: push: tags: ['v*']`.

## Consequences

- (+) Deliberate deploy: nothing reaches the server by accident.
- (+) Trivial rollback: create a previous tag.
- (+) Mandatory semantic versioning (`v1.2.3`), clear traceability.
- (-) Requires tagging discipline.
- (-) For quick experiments, you must commit directly on the server or use a temporary branch.
