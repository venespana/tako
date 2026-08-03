# ADR 0013: Templates embedded in the binary

## Status
Accepted

## Context
The `tako install` command needs to write docker-compose.yml for base stacks (Caddy, AdGuard, Kuma, cloudflared) on the remote host. Options:
- (a) Clone an external git repo with the templates.
- (b) Bundle the templates inside the binary.
- (c) Download them on-demand from a server.

## Decision
**Templates embedded in the binary** (via Bun file imports / Go embed equivalent). The binary is the canonical source of base stacks.

## Consequences
- (+) Self-contained binary, no external dependencies to install.
- (+) Consistent versioning: each binary version has its exact templates.
- (+) Works offline (except for docker image pulls).
- (-) Updating templates requires updating the binary.
- (-) Slightly larger binary (~50KB extra per template).
- (~) The maintainer can have their own personal `homelab` repo with their customized stacks; the embedded templates are the canonical base.
