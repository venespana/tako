# ADR 0005: AdGuard Home as DNS

## Status
Accepted

## Context
We needed local DNS to resolve `*.homelab.internal` on the LAN. The maintainer already uses AdGuard Home for ad blocking, so adding another DNS (dnsmasq) was redundant.

## Decision
**AdGuard Home** as the single local DNS + ad blocker. One tool covers both needs.

## Consequences
- (+) Consolidates DNS + ad blocking in one tool.
- (+) Familiar to the maintainer.
- (+) Admin UI accessible via Caddy as `adguard.homelab.internal`.
- (-) Host port 53 occupied by AdGuard (potential conflict with systemd-resolved on Ubuntu/Debian).
- (-) dnsmasq discarded (lighter but does not do ad blocking).
