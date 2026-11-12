# ADR 0021: `tako status --containers` — per-container view as a flag, not a command

## Status

Accepted

## Context

The MVP definition (2026-11-10) requires container health to be visible both in the hub (TUI) and from the CLI. The CLI command contract (`docs/commands.md`) is closed at 10 commands — inventing an 11th command (`tako containers`) would be a contract break. Meanwhile `tako status` already answers "what is running on this remote" non-interactively (ADR-0020: plain output, exit codes 0/1/2), but only at the compose-stack level (`docker compose ls`); per-container state and healthcheck status are surfaced nowhere outside the TUI.

## Decision

`tako status` gains an OPTIONAL `--containers` flag. With it, the command reads `docker ps -a` on the remote over SSH (read-only) and prints one line per container: name, state, and health (`-` when the container defines no healthcheck), plus a count line. Without it, the command behaves exactly as before: the compose stack listing.

### 1. The 10-command contract is preserved

Health reaches the CLI through a flag on an existing command, not a new command. `docs/commands.md` documents the flag inside the `status` section.

### 2. Exit codes and refusal discipline are unchanged

Same mapping in both modes: `0` ok, `1` refused or invalid usage (unknown remote, refused connection, missing `--host`) with the reason on stderr, `2` unexpected failure. The output stays plain console text (ADR-0020) — no TUI, no interaction.

### 3. Health is auxiliary metadata

The parser treats health as best-effort across docker versions: a container whose health field is absent, empty, or in a foreign shape reports no health rather than refusing the listing. The strict refusal discipline for the core identity fields (name, state) is unchanged.

## Consequences

- (+) The MVP health requirement is met without growing the command surface; scripts get per-container health over plain text.
- (~) `status` now has two output modes selected by a flag; documentation and `--help` must present them together.
- (+) Default mode is pinned byte-identical by test, so existing scripts and cron jobs are unaffected.

## References

- ADR 0020: CLI strictly non-interactive — no views, no forms (style/exit-code conventions)
- ADR 0019: Services layer — the CLI calls the same `getContainers` service as the TUI
- Plan: `odd/tasks/mvp-completion.md` (T3-health-status)
