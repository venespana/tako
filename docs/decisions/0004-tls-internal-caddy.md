# ADR 0004: TLS internal de Caddy

## Status
Accepted

## Context
Necesitábamos certificados TLS para servicios en LAN. Requisito explícito del maintainer: "no instalar nada en los equipos locales" (sin CA root en cada cliente).

Opciones evaluadas: mkcert (requiere instalar CA root en clientes), step-ca (CA server propia, pesada), Caddy `internal` (CA propia generada on-demand, sin instalar nada en clientes).

## Decision
**Caddy con `tls internal`**. Cada servicio con label `caddy.tls: internal` recibe un cert firmado por la CA interna de Caddy. La CA raíz se persiste en `proxy/data/caddy/pki/authorities/local/`.

## Consequences
- (+) Cero instalación en clientes.
- (+) Cero dependencia de Internet (no ACME).
- (+) Renovación automática por Caddy, sin cron ni certbot.
- (-) Navegador advierte "no confiable" la primera vez por host. Accept exception manual.
- (-) Si se borra `proxy/data/caddy/pki/`, todos los certs se regeneran y los clientes deben aceptar excepción de nuevo.
- (~) Si en el futuro se quiere eliminar el warning, se puede exportar la CA root e instalar en trust store de cada cliente (opcional, no requerido).
