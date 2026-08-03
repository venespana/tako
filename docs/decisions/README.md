# Architecture Decision Records (ADRs)

Cada ADR documenta una decisión arquitectónica importante: contexto, decisión tomada, y consecuencias.

## Formato

```
# ADR NNNN: Título corto

## Status
Accepted (o Proposed, Deprecated, Superseded by ADR-YYYY)

## Context
[Contexto y problema que motivó la decisión]

## Decision
[La decisión tomada, clara y concisa]

## Consequences
[Consecuencias: positivas (+), negativas (-), neutrales (~)]
```

## Convenciones

- Numeración secuencial: `0001`, `0002`, ...
- Una vez aceptado, no se edita. Si cambia la decisión, se crea ADR nuevo que lo supersedes.
- Nombres en kebab-case: `0001-name-tako.md`.

## Lista de ADRs

- [0001 - Nombre del proyecto: Tako](0001-name-tako.md)
- [0002 - Stack: Bun + TypeScript + Ink](0002-stack-bun-typescript-ink.md)
- [0003 - Sin orquestador encima](0003-no-orchestrator-on-top.md)
- [0004 - TLS internal de Caddy](0004-tls-internal-caddy.md)
- [0005 - AdGuard Home como DNS](0005-adguard-home-dns.md)
- [0006 - GitOps via tags](0006-gitops-via-tags.md)
- [0007 - Agentes AI solo en PC](0007-agents-ai-pc-only.md)
- [0008 - Cleanup policy segura](0008-cleanup-policy-safe.md)
- [0009 - Multi-host ready](0009-multi-host-ready.md)
- [0010 - Arquitectura FSD + Clean Arch + shared kernel](0010-architecture-fsd-clean-shared.md)
- [0011 - Canales de distribución](0011-distribution-channels.md)
- [0012 - Tests unitarios co-localizados](0012-tests-colocated.md)
- [0013 - Plantillas embebidas en binario](0013-templates-embedded-binary.md)
