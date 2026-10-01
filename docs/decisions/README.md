# Architecture Decision Records (ADRs)

Each ADR documents an important architectural decision: context, decision made, and consequences.

## Format

```
# ADR NNNN: Short title

## Status
Accepted (or Proposed, Deprecated, Superseded by ADR-YYYY)

## Context
[Context and problem that motivated the decision]

## Decision
[The decision made, clear and concise]

## Consequences
[Consequences: positive (+), negative (-), neutral (~)]
```

## Conventions

- Sequential numbering: `0001`, `0002`, ...
- Once accepted, it is not edited. If the decision changes, a new ADR is created that supersedes it.
- Names in kebab-case: `0001-name-tako.md`.

## ADR list

- [0001 - Project name: Tako](0001-name-tako.md)
- [0002 - Stack: Bun + TypeScript + Ink](0002-stack-bun-typescript-ink.md)
- [0003 - No orchestrator on top](0003-no-orchestrator-on-top.md)
- [0004 - Caddy internal TLS](0004-tls-internal-caddy.md)
- [0005 - AdGuard Home as DNS](0005-adguard-home-dns.md)
- [0006 - GitOps via tags](0006-gitops-via-tags.md)
- [0007 - AI agents on PC only](0007-agents-ai-pc-only.md)
- [0008 - Safe cleanup policy](0008-cleanup-policy-safe.md)
- [0009 - Multi-host ready](0009-multi-host-ready.md)
- [0010 - FSD + Clean Arch + shared kernel architecture](0010-architecture-fsd-clean-shared.md)
- [0011 - Distribution channels](0011-distribution-channels.md)
- [0012 - Co-located unit tests](0012-tests-colocated.md)
- [0013 - Templates embedded in binary](0013-templates-embedded-binary.md)
- [0014 - `remote add` singular naming + v0 secrets + cli→tui exception](0014-remote-add-singular-and-v0-secrets.md)
- [0015 - `tako agent` command family (contract deviation; cross-domain port imports)](0015-agent-command-family.md)
- [0016 - Amendment to ADR 0011 — `bun:sqlite` in agent-mode code](0016-bun-sqlite-agent-mode.md)
- [0017 - Release trigger resolution (ADR 0006 vs AGENTS.md) + per-arch assets](0017-release-trigger-resolution.md)
