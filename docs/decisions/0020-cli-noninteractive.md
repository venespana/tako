# ADR 0020: CLI strictly non-interactive — no views, no forms

## Status

Accepted (supersedes ADR 0014; finalizes ADR 0019's transitional Decision 6)

## Context

ADR 0019 modeled the CLI as a non-interactive endpoint (parse → call a service → print) but left ADR 0014's cli→tui exceptions standing transitionally: `tako remote add` opened the TUI add-remote wizard, and `doctor` imported its text formatter from `tui/features`. Phase F3 thinned both commands onto the services layer, so the precondition for removing the exceptions is met — the leftover question was only what the CLI does instead of rendering TUI. This ADR records the owner's product decision (2026-10-08).

## Decision

The CLI is strictly non-interactive: one interactive client (the TUI), one non-interactive client (the CLI).

### 1. No TUI views, no forms — ever

CLI commands never open TUI views and never render forms. Interactivity lives only in the TUI.

### 2. Parameters arrive via flags or stdin (xargs-style)

Forms included: every field a form would collect is a flag or a piped stdin line. Commands compose in pipelines.

### 3. Blocked flows print a field list and exit non-zero

When a flow cannot proceed — missing required input, or a confirmation genuinely needed — the CLI prints a plain list of the fields to fill (name + expected shape, classic CLI style) and exits non-zero, or consumes the values from stdin when piped. No widgets, no prompts-by-view.

### 4. ADR 0014 is fully superseded

Its cli→tui exceptions are removed in deliverable E2 of `odd/tasks/architecture-layers.md`:

- `remote add` goes flags/stdin; the `add-remote-wizard` slice is deleted.
- `doctor` output formatting moves to the cli side; services return structured results.

### 5. Rationale

The wizard exception made the CLI a second frontend of the TUI: a double UX surface kept in sync by comments. Strict separation removes the coupling at its root.

## Consequences

- (-) `remote add` becomes breaking for interactive users: they get the field list instead of the wizard (E2).
- (~) The `add-remote-wizard` slice is deleted, and the `doctor` CLI owns its output formatting (E2).
- (+) The transitional language in ADR 0019 and `AGENTS.md` ends; the cli↔tui rule becomes unconditional.

## References

- ADR 0019: Services layer — Tako as one server with two clients (Decision 6, now final)
- ADR 0014: `tako remote add` — singular naming, v0 secrets posture, and managed cli→tui exception (superseded)
- Plan: `odd/tasks/architecture-layers.md` (deliverables E1, E2)
