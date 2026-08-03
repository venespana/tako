# ADR 0007: Agentes AI solo en PC

## Status
Accepted

## Context
Se consideró instalar OpenChamber + OpenCode en el server para tener agentes AI que ayudasen a resolver problemas cuando algo fallara. Análisis de riesgos:
- Docker socket = root efectivo (cualquiera que pueda correr `docker` puede tomar el host).
- Prompt injection desde logs/issues/comentarios puede inducir comandos maliciosos.
- Exfiltración de `.env` con secretos.
- Persistencia: agente puede crear cron/systemd malicioso.
- API key del LLM también comprometida si rompen el server.

## Decision
**Agentes AI corren SOLO en la PC del usuario. Cero agentes en el server.** Patrón de uso: Kuma avisa caída → Dozzle/logs via SSH → OpenCode en PC con contexto del problema → fix → tag → deploy.

## Consequences
- (+) Elimina la mayor superficie de compromiso del server.
- (+) Agentes en contexto fresco por sesión.
- (+) API keys del LLM no viven en el server.
- (-) El usuario debe empujar contexto manualmente al agente cuando hay problemas en el server (vs auto-fix 24/7).
- (-) Sin auto-remediación nocturna sin intervención humana.
