# Migrate pen.dev design to FigCraft/Figma

> **Superseded (2026-11-13).** This session's artifacts lived only in the main
> checkout and were never committed; the `.fig` and the SVG exports are gone.
> The canvas now lives in `tako.figcraft` (repo root) and FigCraft is the only
> design tool — `design.pen` was deleted and the generator that mirrored it
> (`scripts/pen-to-figcraft.ts`) went with it. The one screen that only existed
> here, `Screen - Network / Error`, was recovered into the canvas — see
> `odd/tasks/tako-missing-flow-states.md`.

## Objective

Rebuild every screen in `design.pen` (repo root) as an editable FigCraft document, then export Figma-importable artifacts.

## Problem

The Tako TUI design lives in pen.dev (encrypted .pen, MCP-only). User wants it in Figma. No direct .pen → .fig migration exists; Figma's REST API cannot write file content.

## Why

FigCraft can save native `.figcraft`, an experimental `.fig` (Figma format), and per-layer SVG that Figma imports with editable layers.

## Scope

- 14 screen frames + 4 captions (Screens page, original coordinates)
- 9 reusable frames as real components (Components page)
- 9 design variables (8 colors + font string) bound via `{$var}` fills
- Mascot image fill from `design-assets/tako-logo.jpg`

## Tasks

- [x] T1 Probe FigCraft batch/variable/text mechanics (lineHeight %, fontWeight in create props)
- [x] T2 Create variable collection + variables
- [x] T3 Build Components page (9 components; App Header nests Logo instance)
- [x] T4 Build Screens page: 14 screens flattened from pen JSON (BFS batched, refs inlined with descendant overrides) — 731 nodes
- [x] T5 Verify: screenshots (home/status/remote/logs) vs JSON spec, node counts match (created = expected−1 by root convention), fills bound to variables, missing fonts checked
- [x] T6 Export: `design/tako-design.figcraft` (163 KB), `design/tako-design.fig` (157 KB, no warnings), 14 SVGs in `design/svg/` with editable `<text>`
- [x] T7 Add `Screen - Network / Error` (user request, live session): 24 nodes at x 8720 y 1200, follows Screen - Status / Error pattern; exports refreshed (.figcraft 175 KB, .fig 168 KB, svg/15-screen-network-error.svg)

## Authorized scope

FigCraft document + `design/` export folder. No repo source changes; nothing committed without user validation.

## Checks

- [x] Node count per screen matches expanded pen JSON tree
- [x] Fills bind to variables (boundVariables → VariableID:2 confirmed on Screen - Home)
- [x] Screenshot eyeball of 4 representative screens — layout, colors, content correct
- [!] JetBrains Mono not installed locally; font.download refused (user setting off). File records the family; Figma resolves it natively. Local preview used fallback metrics.

## Decisions

- Screens flattened (no live instances) — SVG/.fig targets flatten anyway; Components page keeps the building blocks. Instance/slot wiring offered as follow-up.
- pen default layout = horizontal, padding `[v,h]` = CSS shorthand (per pen.dev skill).
- FigCraft gotchas handled: frame default fill is white (must pass `fill:"none"`), default `gap` is 10 (always set explicitly), `component.create` with several ids wraps them into ONE component (convert one at a time), `instance.create` takes no `name`.

## Progress

- Route: direct inline via Code Mode (scripted conversion, single GUI state) — completed.
- Deliverables: `design/tako-design.figcraft`, `design/tako-design.fig`, `design/svg/01..14-*.svg`.
- Next (optional, user decision): live instance/slot wiring in screens; commit after validation.
