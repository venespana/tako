# ADR 0003: No orchestrator on top

## Status
Accepted

## Context
The maintainer tried Coolify and found it uncomfortable due to the abstraction. Komodo was evaluated but shares the same problem: it adds another layer with its own mental model (Resources, Stacks, Build, Procedures, Deployments). Portainer does the same with similar overhead.

## Decision
**Do not use an orchestrator on top of docker-compose**. Each service is an autonomous `docker-compose.yml` stack, managed by:
- GitOps via GitHub Actions (deploy on tag).
- Cron for cleanup.
- Custom TUI (Tako) for interactive local management via SSH.

## Consequences
- (+) Maximum control: what you see in the repo is what runs.
- (+) Each piece is replaceable (lazydocker, Kuma, Dozzle equivalents can be swapped without touching the others).
- (+) Zero dependency on a tool with its own model to maintain.
- (-) You need to combine several small pieces instead of one large one.
- (-) Building images from Dockerfile in UI is not covered by default (done in CI).
