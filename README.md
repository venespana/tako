# Tako 🐙

TUI para gestionar homelabs basados en docker-compose via SSH.

Tako corre en tu PC y se conecta a tus servidores por SSH (estilo VSCode Remote). Los servidores no exponen nada nuevo: la gestión pasa por SSH. Permite bootstrap de stacks base (Caddy + AdGuard + Uptime Kuma + cloudflared), deploy via tags, status de servicios, logs en vivo, rollback y cleanup.

## Status

🚧 En diseño. No hay release usable todavía. Ver [roadmap](docs/index.md#roadmap).

## Filosofía

- **Host limpio**: el servidor solo lleva Docker + las piezas mínimas. Cero orquestador encima (Coolify/Komodo/Portainer descartados).
- **Piezas pequeñas especializadas**: cada función (status, logs, deploy) cubierta por una herramienta ligera.
- **SSH como transporte único**: nada nuevo expuesto en el server.
- **Plantillas embebidas en el binario**: el binario es fuente canónica de los stacks base.

## Documentación

- [Arquitectura](docs/architecture.md)
- [Stack técnico](docs/stack.md)
- [Spec CLI](docs/commands.md)
- [Estrategia tests](docs/testing.md)
- [Distribución](docs/distribution.md)
- [Decisiones (ADRs)](docs/decisions/)

## Licencia

MIT. Ver [LICENSE](LICENSE).
