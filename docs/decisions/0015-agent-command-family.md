# ADR 0015: `tako agent` command family (contract deviation; cross-domain port imports)

## Status

Accepted

## Context

The public command contract in `docs/commands.md` is closed at 9 commands, and new commands require a decision record. Unattended job execution (scheduled stack lifecycle and prune on managed servers) needs a persistent server-side daemon, which no existing command provides: today every action is client-driven over a live SSH session. ADR 0014 already established the precedent for documented, narrow deviations from the closed contract.

Adding the agent also raises a cross-domain question: the agent domain must reach remote channels and docker operations that belong to the `remotes` and `docker` domains, without re-introducing runtime coupling between domains.

## Decision

### 1. Top-level `agent` command family (deviation from closed contract)

Add one new command entry, `tako agent`, with four subcommands: `run | install | uninstall | status`.

- `run` (server): daemon started by the `systemd --user` unit — binds the UNIX socket, opens the database, serves the agent protocol.
- `install <remote>` / `uninstall <remote>` / `status <remote>` (client): provisioning and inspection over SSH.

Contract count moves 9 → 10. This is a documented deviation in the same spirit as ADR 0014 (singular `remote add`).

### 2. `install` is idempotent and doubles as the explicit upgrade path

No separate `upgrade` command. Re-running `install` on an existing installation performs the upgrade (re-copy binary → restart unit → re-probe). A client/agent version mismatch surfaces via the protocol handshake as a warning; the user acts by re-running `install`. There is no auto-upgrade.

### 3. Plain console output for agent subcommands

`agent install|uninstall|status` use plain console output — no Ink, and therefore no new cli→tui import exception. ADR 0014's managed exceptions remain the only ones.

### 4. Amendment to ADR 0010 dependency rules: type-only cross-domain port imports

A domain's `application/` ports are its public API. Other domains may import them **type-only** (`import type`); runtime wiring happens exclusively in cli/tui composition roots. Enforced mechanically with new `import-x/no-restricted-paths` zones in `eslint.config.js`.

## Consequences

- (+) Unattended jobs become possible with one command family instead of per-feature commands.
- (+) Contract count 9 → 10 is a documented, deliberate deviation.
- (+) Zero runtime coupling between domains; composition roots keep wiring local.
- (+) ESLint zones keep the type-only rule mechanical instead of review-dependent.
- (-) The closed contract grows; the 10-command contract is now the closed set.
- (-) `install`-as-upgrade is explicit but manual; handshake mismatch guides the user instead of auto-healing.

## References

- Spec: `openspec/changes/remote-agent/specs/`
- Design: `openspec/changes/remote-agent/design.md` (D2, D4)
- ADR 0010: FSD + Clean Arch + shared kernel architecture
- ADR 0014: `tako remote add` — singular naming and managed cli→tui exception
