# Documentation

Index of Tako's documentation.

## Sections

- [Architecture](architecture.md) — architectural philosophy, FSD + Clean Arch + shared kernel.
- [Technical stack](stack.md) — Bun + TypeScript + Ink + React + dockerode + ssh2.
- [TUI routing](tui-routing.md) — file-based route convention and generator.
- [CLI spec](commands.md) — the 9 commands and their public contract.
- [Testing strategy](testing.md) — co-located unit tests, integration and e2e separated.
- [Distribution](distribution.md) — GitHub Releases + install.sh + npm.

## Decisions (ADRs)

Design decisions are documented as Architecture Decision Records in [decisions/](decisions/). Each ADR explains context, decision, and consequences.

## Roadmap

### v0.1 (MVP)

- `tako doctor` command working.
- `tako status <host>` command with docker domain.
- `tako logs <stack>` basic command.

### v0.2

- `tako remotes add/list/use`.
- Basic interactive TUI.

### v0.3

- `tako install` (bootstrap of remote host).
- Templates embedded in binary operational.

### v0.4

- `tako update --host X` (diff + redeploy).
- Fluid multi-host in the TUI.

### v0.5+

- Uptime Kuma API integration.
- `tako rollback` with versioned tags.
- MCP server (optional).
