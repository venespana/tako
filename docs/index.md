# Documentación

Índice de la documentación de Tako.

## Secciones

- [Arquitectura](architecture.md) — filosofía arquitectónica, FSD + Clean Arch + shared kernel.
- [Stack técnico](stack.md) — Bun + TypeScript + Ink + React + dockerode + ssh2.
- [Spec CLI](commands.md) — los 9 comandos y su contrato público.
- [Estrategia tests](testing.md) — unitarios co-localizados, integración y e2e separados.
- [Distribución](distribution.md) — GitHub Releases + install.sh + npm.

## Decisiones (ADRs)

Las decisiones de diseño están documentadas como Architecture Decision Records en [decisions/](decisions/). Cada ADR explica contexto, decisión y consecuencias.

## Roadmap

### v0.1 (MVP)
- Comando `tako doctor` funcional.
- Comando `tako status <host>` con dominio docker.
- Comando `tako logs <stack>` básico.

### v0.2
- `tako remotes add/list/use`.
- TUI interactivo básico.

### v0.3
- `tako install` (bootstrap de host remoto).
- Plantillas embebidas en binario operativas.

### v0.4
- `tako update --host X` (diff + redeploy).
- Multi-host fluido en el TUI.

### v0.5+
- Integración Uptime Kuma API.
- `tako rollback` con tags versionados.
- MCP server (opcional).
