# ADR 0007: AI agents on PC only

## Status
Accepted

## Context
Installing OpenChamber + OpenCode on the server was considered, to have AI agents help resolve problems when something failed. Risk analysis:
- Docker socket = effective root (anyone who can run `docker` can take over the host).
- Prompt injection from logs/issues/comments can induce malicious commands.
- Exfiltration of `.env` with secrets.
- Persistence: agent can create malicious cron/systemd.
- LLM API key also compromised if the server is breached.

## Decision
**AI agents run ONLY on the user's PC. Zero agents on the server.** Usage pattern: Kuma alerts an outage → Dozzle/logs via SSH → OpenCode on PC with problem context → fix → tag → deploy.

## Consequences
- (+) Eliminates the largest attack surface on the server.
- (+) Agents in fresh context per session.
- (+) LLM API keys do not live on the server.
- (-) The user must manually push context to the agent when server issues occur (vs 24/7 auto-fix).
- (-) No overnight auto-remediation without human intervention.
