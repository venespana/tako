# ADR 0005: AdGuard Home como DNS

## Status
Accepted

## Context
Necesitábamos DNS local para resolver `*.homelab.internal` en la LAN. El maintainer ya usa AdGuard Home para bloqueo de publicidad, así que añadir otro DNS (dnsmasq) era redundante.

## Decision
**AdGuard Home** como único DNS local + bloqueo de ads. Una sola herramienta cubre ambas necesidades.

## Consequences
- (+) Consolida DNS + bloqueo ads en una herramienta.
- (+) Familiar para el maintainer.
- (+) Admin UI accesible via Caddy como `adguard.homelab.internal`.
- (-) Puerto 53 del host ocupado por AdGuard (conflicto potencial con systemd-resolved en Ubuntu/Debian).
- (-) dnsmasq descartado (era más ligero pero no hace bloqueo de ads).
