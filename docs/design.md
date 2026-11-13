# Design System

Written ruleset for Tako's visual design work. The mockups live in a FigCraft
file (`tako.figcraft`); this document is the canonical set of rules for both the
canvas and any future implementation that consumes it.

Precedence: **TUI code > this document > canvas.** Tokens, strings, and behaviors
are extracted from `src/tui` — when the app changes, update the canvas and this
document to match. Never invent UI on the canvas that the app does not have.

## Canvas

One design surface: the FigCraft file at the repo root.

- File: `tako.figcraft` (committed). Page: `Tako — TUI screens`.
- **FigCraft is the tool** — edit the file there (FigCraft app or the
  `figcraft` MCP). Nothing regenerates it; it is hand-maintained from now on.
- The old Pencil canvas is retired: `design.pen` was deleted (2026-11-13) and
  the pen.dev document is no longer the source of truth. Its 14 screens live on
  in this file, together with the 21 intermediate states and `Screen - Network /
Error` (recovered from the earlier migration).
- Tokens are document variables in the `Tako` collection: `bg`, `text-primary`,
  `muted`, `accent`, `success`, `error`, `warning`, `border`, `font-mono`.
- Components (17): `Chrome / Logo`; `Chrome / App Header` plus its
  `/ No Agent`, `/ No Remote` and `/ No Remote Selected` variants; and the
  `Chrome / Footer` variants `/ Menu`, `/ Command`, `/ Form`, `/ Refresh`,
  `/ Retry`, `/ Reconnect`, `/ Browse`, `/ Tasks Form`, `/ Follow`,
  `/ Confirm`, `/ Refresh Browse`, `/ Global Actions`.
- The `STATE → SOURCE` frame on the canvas maps each screen to the
  `src/tui` file that renders it.
- The **`00 · Design system` page** is the visual spec: token swatches, the
  type scale, the status glyphs, the screen anatomy with its numbers, the
  component index and the rules. When this document and that page disagree,
  fix both.

### Canvas organisation

36 screens grouped in labelled bands, each band with a caption above its first
screen, six screens per row at 1120px spacing and 800px per row:

| Band                     | Screens                                               |
| ------------------------ | ----------------------------------------------------- |
| ENTRY · LOCAL            | Home, Doctor                                          |
| REMOTE SETUP             | Remotes, Remote Connect, Add Remote                   |
| REMOTE HUB · TABS        | Home / Remote, Home / Remote / Global Actions         |
| DRILL-INS & ACTIONS      | Logs, Status, Tasks, Cleanup                          |
| STATUS FAMILY STATES     | Status / Loading, Status / Empty, Status / Error      |
| HUB STATES               | Home / Remote / Loading, / Empty, / Error             |
| LOGS STATES              | Logs / Connecting, / Ended, / Error                   |
| REMOTES STATES           | Remotes / Loading, / Error, / Empty                   |
| CONNECT GATE STATES      | Remote Connect / Validating, / Error                  |
| DOCTOR STATES            | Doctor / Checking, / Error                            |
| ADD REMOTE WIZARD STATES | Add Remote / Validating, / Host Key, / Saved, / Error |
| TASKS STATES             | Tasks / Agent Install, / Install Failed, / No Dry-run |
| GLOBAL ERROR STATES      | Route Error                                           |

The band order follows the user journey: enter locally → set a remote up →
work on a host → drill into a screen → and the intermediate states each of
those screens can land in.

## Design tokens

Defined once as document variables; always reference them (`$name`) — never
hardcode raw values in nodes.

| Token           | Value            | Usage                                  | TUI source                  |
| --------------- | ---------------- | -------------------------------------- | --------------------------- |
| `$bg`           | `#0D1117`        | Screen background (terminal viewport)  | terminal default background |
| `$text-primary` | `#E6EDF3`        | Normal text                            | Ink default text color      |
| `$muted`        | `#8B949E`        | Dim/secondary text: versions, hints    | `dimColor` / `gray`         |
| `$accent`       | `#22D3EE`        | Wordmark, cursor `❯`, focus, "running" | `cyan`                      |
| `$success`      | `#3FB950`        | `✓` found / succeeded                  | `green`                     |
| `$error`        | `#F85149`        | `✖` not found, errors                  | `red`                       |
| `$warning`      | `#D29922`        | Warnings, unsupported                  | `yellow`                    |
| `$font-mono`    | `JetBrains Mono` | Everything (terminal monospace)        | terminal monospace          |

Emphasis rules: **bold** marks headers, group labels, key bindings, and the
focused/current item; muted marks secondary info. Body text uses `$text-primary`
without weight.

## Components

Components are FigCraft components (`Chrome / *`); screens instance them and
customize through overrides only.

### `Chrome / Logo`

ASCII block-letter `TAKO` wordmark (source: `src/tui/widgets/app-shell/ui/Logo.tsx`),
bold, `$accent`, 16px, fixed-width text (380). Used at the top of every screen.

### `Chrome / App Header`

The shell chrome every screen starts with: a `Chrome / Logo` instance over the
active-remote line, vertical, gap 2. The line is `{remote} · agent {v} (active)`
in dim cyan. Four variants:

| Variant                                    | Active-remote line                            |
| ------------------------------------------ | --------------------------------------------- |
| `Chrome / App Header`                      | `homeserver · agent 0.2.0 (active)`           |
| `Chrome / App Header / No Agent`           | `homeserver` (no agent version yet)           |
| `Chrome / App Header / No Remote Selected` | `no remote selected`                          |
| `Chrome / App Header / No Remote`          | no line (the shell hides it without a remote) |

### `Chrome / Footer / *`

Key-hints row over the version bar (`v0.7.0`). Hints follow
`src/tui/widgets/app-shell/ui/KeyHints.tsx` exactly: bold key + `" label  "`,
left to right, then `h/Esc back` and `q quit` (always last). The hint row is a
frame named `Hints`; the version is the `version` text.

| Variant            | Hints                                                                   |
| ------------------ | ----------------------------------------------------------------------- |
| `/ Menu`           | `↑↓/j k` · `Enter/l select` · back · quit                               |
| `/ Command`        | back · quit                                                             |
| `/ Form`           | none (forms suppress back/quit; only the version shows)                 |
| `/ Refresh`        | `r refresh` · back · quit                                               |
| `/ Retry`          | `r retry` · back · quit                                                 |
| `/ Reconnect`      | `r reconnect` · back · quit                                             |
| `/ Browse`         | `n new` · `r dry-run` · `a apply` · `e edit` · `d delete` · back · quit |
| `/ Tasks Form`     | `tab fields` · `enter submit` · `esc cancel`                            |
| `/ Follow`         | `f follow` · `↑↓ scroll` · back · quit                                  |
| `/ Confirm`        | `y confirm` · `N/Esc cancel`                                            |
| `/ Refresh Browse` | `r refresh` · `↑↓/j k select` · back · quit                             |
| `/ Global Actions` | `↑↓/j k select` · `Enter/l run` · `1/2 tab` · back · quit               |

Menu rows, doctor tool lines and the status table are inlined per screen — they
are content, not chrome.

## Screens

Screen frame recipe: `1040x640`, `fill: $bg`, `clip: true`, vertical layout,
padding `[28, 36]`, `justifyContent: space_between` → header top, body middle,
footer bottom. The body is a vertical frame, gap 12, padding-top 32 (the app's
2-line spacer under the logo).

The 36 screens and their bands are listed in **Canvas organisation** above; the
`STATE → SOURCE` frame on the canvas maps each one to the `src/tui` file that
renders it.

## Adding a screen

1. Pick the band it belongs to (or open a new one): the grid is 1120px wide per
   screen, 800px per band row, six screens per row, caption 44px above the
   band's first screen.
2. Create the screen frame with the recipe above.
3. Instance the `Chrome / App Header` variant the session needs, and the
   `Chrome / Footer / *` variant the page type publishes (see `usePageHints`).
4. Compose the body from the strings the code prints — never invent copy.
5. Verify: read the node tree back and take a screenshot of the screen.
   Gotcha: a text inserted in the same call as the screenshot renders blank —
   retake the screenshot.
6. Add the row to the `STATE → SOURCE` map and to the band caption if new.

## Reserved conventions (from code, ready for future screens)

Run-status glyph map (`src/tui/features/tasks/job-history/model/job-history.ts`):
pending `·` gray · running `…` cyan · succeeded `✓` green · failed `✗` red ·
unsupported `×` yellow.

Remote-active header line (AppShell): `{remote} · agent {v} (active)` in cyan +
dim. There is no breadcrumb in the shell — the header shows the logo and that
line only (the `Chrome / App Header` variants above).

Health badge (hub inventory, `RemoteHomeDashboard.tsx`): the healthcheck outcome
renders as a word after the container name — `healthy` in `$success`,
`unhealthy` in `$error`.
