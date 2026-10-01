# ADR 0016: Amendment to ADR 0011 — `bun:sqlite` in agent-mode code

## Status

Accepted (amends ADR 0011)

## Context

ADR 0011 mandates Node 20+ compatibility for the npm distribution channel ("Bun-only APIs forbidden"). The agent needs durable local storage for its job queue and run history. Options considered:

1. `bun:sqlite` — built into the Bun runtime, zero new dependencies.
2. `node:sqlite` — Node 22+ only; breaks the Node 20 floor.
3. JSON file storage — no queryability, fragile concurrency.

The agent (`tako agent run`) always executes as the compiled Bun binary, never through the npm/Node channel.

Job persistence is delegated to **bunqueue** (embedded mode, its own SQLite schema at the same dataPath — design D3), so the storage zone covers both `bun:sqlite` and the bunqueue client.

## Decision

`bun:sqlite` (and the Bun-only bunqueue client) is permitted **only** inside:

- `src/domains/agent/infrastructure/persistence/**`
- the agent-mode composition root (`src/cli/commands/agent-run.ts`)

Both reach it via a lazy `import()` so npm/Node client paths never load it. `tako agent run` executed under a non-Bun runtime fails at startup with an explicit message. All other code keeps the Node 20+ rule unchanged.

**Firing authority (amendment, maintainer decision 2026-09-18):** bunqueue is used as **durable storage only** — `BunqueueJobStore` never arms bunqueue job schedulers. `RunSchedulerLoop`'s watermark tick is the sole firing authority (spec: missed jobs run exactly once); armed-but-unconsumed schedulers would only accumulate dead queue rows. The store's `open()` disarms any scheduler persisted by a pre-9.8 database.

## Consequences

- (+) Durable, queryable job storage with zero new dependencies.
- (+) The npm channel is unaffected: Node clients never import the persistence layer.
- (+) Agent persistence is Bun-only by construction, not by convention.
- (-) The Node-20 rule becomes scoped rather than absolute; ESLint zones must keep the exception from leaking.
- (-) Two storage runtimes coexist in one binary (client `conf` vs agent SQLite) — acceptable; they serve disjoint processes.
- (~) Bunqueue's cron scheduler machinery ships unused (storage-only); the watermark tick owns firing decisions instead.

## References

- Design: `openspec/changes/remote-agent/design.md` (D3)
- ADR 0011: Distribution channels (Node 20+ compat rule)
