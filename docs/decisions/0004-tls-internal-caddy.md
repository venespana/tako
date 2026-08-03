# ADR 0004: Caddy internal TLS

## Status
Accepted

## Context
We needed TLS certificates for LAN services. Explicit requirement from the maintainer: "do not install anything on local machines" (no root CA on each client).

Options evaluated: mkcert (requires installing root CA on clients), step-ca (own CA server, heavy), Caddy `internal` (own CA generated on-demand, without installing anything on clients).

## Decision
**Caddy with `tls internal`**. Each service with label `caddy.tls: internal` receives a cert signed by Caddy's internal CA. The root CA is persisted in `proxy/data/caddy/pki/authorities/local/`.

## Consequences
- (+) Zero installation on clients.
- (+) Zero Internet dependency (no ACME).
- (+) Automatic renewal by Caddy, no cron or certbot.
- (-) Browser warns "not trusted" the first time per host. Manual accept exception.
- (-) If `proxy/data/caddy/pki/` is deleted, all certs regenerate and clients must accept the exception again.
- (~) If in the future you want to remove the warning, you can export the root CA and install it in each client's trust store (optional, not required).
