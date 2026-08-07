# ADR 0009: Multi-host ready

## Status

Accepted

## Context

Today the homelab has 1 docker host. But the maintainer does not rule out adding a second host (NAS, VPS, mini PC) in 6-12 months. The design must not break when scaling.

## Decision

**The homelab stack and the TUI must be multi-host ready by design**, even if only 1 host is used today:

- Uptime Kuma monitors N hosts from 1 central instance (external HTTP checks).
- Dozzle-equivalent in the TUI sees N hosts via Docker remote contexts / SSH.
- GitHub Actions with `matrix` deploys to N hosts.
- `lazydocker` runs on each host (ad-hoc local inspection).

## Consequences

- (+) Adding a second host is trivial: duplicate the base stack, register it as remote in Tako.
- (+) No architectural redesign when growing.
- (-) Some initial complexity (remote registration, host naming).
- (-) Maintenance of N lazydocker instances (one per host).
