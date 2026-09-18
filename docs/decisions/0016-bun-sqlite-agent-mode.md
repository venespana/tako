# ADR 0016: Amendment to ADR 0011 — `bun:sqlite` in agent-mode code

## Status

Accepted (amends ADR 0011)

## Context

ADR 0011 mandates Node 20+ compatibility for the npm distribution channel ("Bun-only APIs forbidden"). The agent needs durable local storage for its job queue and run history. Options considered:

1. `bun:sqlite` — built into the Bun runtime, zero new dependencies.
2. `node:sqlite` — Node 22+ only; breaks the Node 20 floor.
3. JSON file storage — no queryability, fragile concurrency.

The agent (`tako agent run`) always executes as the compiled Bun binary, never through the npm/Node channel.

## Decision

`bun:sqlite` is permitted **only** inside:

- `src/domains/agent/infrastructure/persistence/**`
- the agent-mode composition root (`src/cli/commands/agent-run.ts`)

Both reach it via a lazy `import()` so npm/Node client paths never load it. `tako agent run` executed under a non-Bun runtime fails at startup with an explicit message. All other code keeps the Node 20+ rule unchanged.

## Consequences

- (+) Durable, queryable job storage with zero new dependencies.
- (+) The npm channel is unaffected: Node clients never import the persistence layer.
- (+) Agent persistence is Bun-only by construction, not by convention.
- (-) The Node-20 rule becomes scoped rather than absolute; ESLint zones must keep the exception from leaking.
- (-) Two storage runtimes coexist in one binary (client `conf` vs agent SQLite) — acceptable; they serve disjoint processes.

## References

- Design: `openspec/changes/remote-agent/design.md` (D3)
- ADR 0011: Distribution channels (Node 20+ compat rule)
