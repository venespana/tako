# ADR 0013: Plantillas embebidas en binario

## Status
Accepted

## Context
El comando `tako install` necesita escribir docker-compose.yml de stacks base (Caddy, AdGuard, Kuma, cloudflared) en el host remoto. Opciones:
- (a) Clonar un repo git externo con las plantillas.
- (b) Bundlear las plantillas dentro del binario.
- (c) Descargarlas on-demand desde un server.

## Decision
**Plantillas embebidas en el binario** (vía Bun file imports / Go embed equivalent). El binario es la fuente canónica de los stacks base.

## Consequences
- (+) Binario self-contained, sin dependencias externas para hacer install.
- (+) Versionado consistente: cada versión del binario tiene sus plantillas exactas.
- (+) Funciona offline (salvo descarga de imágenes docker).
- (-) Actualizar plantillas requiere actualizar binario.
- (-) Binario ligeramente más grande (~50KB extra por plantilla).
- (~) El maintainer puede tener su propio repo `homelab` personal con sus stacks customizados; las plantillas embebidas son las canónicas base.
