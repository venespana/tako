# ADR 0009: Multi-host ready

## Status
Accepted

## Context
Hoy el homelab tiene 1 host docker. Pero el maintainer no descarta añadir un segundo host (NAS, VPS, mini PC) en 6-12 meses. El diseño no debe romper al escalar.

## Decision
**El stack del homelab y el TUI deben ser multi-host ready por diseño**, aunque hoy solo se use 1 host:
- Uptime Kuma monitorea N hosts desde 1 instancia central (HTTP checks externos).
- Dozzle-equivalent en el TUI ve N hosts via Docker remote contexts / SSH.
- GitHub Actions con `matrix` deploya a N hosts.
- `lazydocker` corre en cada host (inspección local ad-hoc).

## Consequences
- (+) Añadir un segundo host es trivial: duplicar el stack base, registrarlo como remote en Tako.
- (+) Sin rediseño arquitectural al crecer.
- (-) Algo de complejidad inicial (registro de remotos, naming de hosts).
- (-) Mantenimiento de N instancias lazydocker (una por host).
