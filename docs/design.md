# Design System

Written ruleset for Tako's visual design work. Mockups live on a pen.dev canvas
(Pencil); this document is the canonical set of rules for both the canvas and any
future implementation that consumes it.

Precedence: **TUI code > this document > canvas.** Tokens, strings, and behaviors
are extracted from `src/tui` — when the app changes, update the canvas and this
document to match. Never invent UI on the canvas that the app does not have.

## Canvas

- Document: `~/.pencil/documents/6ae5f8c3-11e6-4bd2-8e18-eab8172db116/pencil-new.pen`
  (edit through the Pencil app / `tools.pencil.execute`).
- Assets live next to the `.pen` file and are referenced relatively
  (`./tako-logo.jpg`, copied from `docs/assets/tako-logo.jpg`).
- Layout convention: reusable components in a row along the top; screens below,
  growing to the right.
- Node IDs referenced below are stable canvas identifiers, kept here so future
  sessions can instance components without re-discovering them.

## Design tokens

Defined once as document variables; always reference them (`$name`) — never
hardcode raw values in nodes.

| Token           | Value       | Usage                                   | TUI source                  |
| --------------- | ----------- | --------------------------------------- | --------------------------- |
| `$bg`           | `#0D1117`   | Screen background (terminal viewport)   | terminal default background |
| `$text-primary` | `#E6EDF3`   | Normal text                             | Ink default text color      |
| `$muted`        | `#8B949E`   | Dim/secondary text: versions, hints     | `dimColor` / `gray`         |
| `$accent`       | `#22D3EE`   | Wordmark, cursor `❯`, focus, "running"  | `cyan`                      |
| `$success`      | `#3FB950`   | `✓` found / succeeded                   | `green`                     |
| `$error`        | `#F85149`   | `✖` not found, errors                   | `red`                       |
| `$warning`      | `#D29922`   | Warnings, unsupported                   | `yellow`                    |
| `$font-mono`    | `JetBrains Mono` | Everything (terminal monospace)    | terminal monospace          |

Emphasis rules: **bold** marks headers, group labels, key bindings, and the
focused/current item; muted marks secondary info. Body text uses `$text-primary`
without weight.

## Components

All components are reusable canvas nodes (`reusable: true`). Screens compose them
through instances (`ref`) and customize via property overrides only.

### Logo — `EEptB`

ASCII block-letter `TAKO` wordmark (source: `src/tui/widgets/app-shell/ui/Logo.tsx`),
bold, `$accent`, fixed-width text (380). Wordmark text node: `bLGOu`.
Used at the top of every screen.

### Breadcrumb — `JryQH`

Shows the current location: `Local > Doctor`.

| Part      | Node     | Style                          |
| --------- | -------- | ------------------------------ |
| Parent    | `JZHW3`  | `$muted`                       |
| Separator | `dRQIQ`  | `" > "`, `$muted`              |
| Current   | `LyU39`  | bold, `$text-primary`          |

Instance it on every non-root screen and override `Parent`/`Current` content
(e.g. `Remotes` / `Select`). The root menu (Home) renders no breadcrumb.

### App Header — `WRhSe`

Standard header for command screens: `Tako Logo` (`aB6b7`) stacked over a
`Breadcrumb` instance (`bfIHb`), gap 2. One instance replaces both pieces.
Override the breadcrumb through the nested instance path
`<headerInstance>/bfIHb/JZHW3` (Parent) and `<headerInstance>/bfIHb/LyU39`
(Current).

### Menu Item / Focused — `xKiLO`

Cyan `❯` cursor (`lA64Y`) + label (`YGJej`, leading space, `$text-primary`).
The focused row of a menu.

### Menu Item / Default — `As5GX`

Two-space cursor (`FMDFk`) + label (`Dj4ws`). Disabled items override the label
fill to `$muted`.

### Menu Group — `gM34b`

Bold group label (`AN2Rt`) over an `Items` slot frame (`YjUD4`, recommended
children: the two menu items). Insert item instances through
`<groupInstance>/YjUD4` and override the group label per instance.

### Footer — `zBl6P`

Key-hints line (`Qfnk1`) over the version bar (`Wu2nR`, `v0.2.0`). Hints follow
`src/tui/widgets/app-shell/ui/KeyHints.tsx` exactly: bold key + `" label  "`,
left to right.

| Hint node      | Content       | Note                       |
| -------------- | ------------- | -------------------------- |
| `U9sSJ`        | `↑↓/j k  `    | menu pages only            |
| `gn9j9`        | `Enter/l`     | bold, menu pages only      |
| `zZPWs`        | ` select  `   | menu pages only            |
| `wRRQv`        | `h/Esc`       | bold, always               |
| `dG52I`        | ` back  `     |                            |
| `K18gQt`       | `q`           | bold, always               |
| `a21hd`        | ` quit`       |                            |

Page variants via instance overrides:

- **Menu screens**: all hints enabled (default).
- **Command screens**: disable `U9sSJ`, `gn9j9`, `zZPWs` → `h/Esc back  q quit`.
- **Form screens**: disable all seven (forms suppress back/quit).

### Doctor Tool Line — `ZPVX6`

Tool status line (source: `src/tui/features/doctor/ui/DoctorToolLine.tsx`):
glyph (`e0fnKl`) + label (`RNhMC`) + version (`haMfr`, `$muted`).

- Found: `✓` `$success`, label `" docker"`, version `" 27.0.3"`.
- Not found: `✖` `$error`, label, version text `" not found"`.

## Screens

Screen frame recipe: `1040x640`, `fill: $bg`, `clip: true`, vertical layout,
padding `[28, 36]`, `justifyContent: space_between` → header top, content middle,
footer bottom. Keep `placeholder: true` while building a screen, remove when done.

Current screens:

- **Screen — Home** `EvV3N`: Logo, ActionMenu (Local › Doctor focused; Remote ›
  Select/Add/Delete; Config empty), full menu Footer. No breadcrumb (root).
- **Screen — Doctor** `KWNqE`: App Header (`Local > Doctor`), five Doctor Tool
  Lines (`docker compose` not found for the red variant), dim summary
  `4/5 tools found`, command-screen Footer.

## Adding a screen

1. `FindEmptySpace` to the right of the last screen; create the screen frame with
   the recipe above.
2. Instance `App Header`; override the breadcrumb Parent/Current.
3. Compose content from component instances; screen-specific content only for
   pieces no component covers (add a reusable component if it will repeat).
4. Instance `Footer` with the right hint variant for the page type.
5. Verify: problems check + `TakeScreenshot`. Gotcha: newly inserted text renders
   blank in a screenshot taken in the same `execute` call — retake a fresh one.
   Known false positive: disabled instance nodes (hidden footer hints) report
   `partially clipped` ghost bounds; confirm visually.

## Reserved conventions (from code, ready for future screens)

Run-status glyph map (`src/tui/features/tasks/job-history/model/job-history.ts`):
pending `·` gray · running `…` cyan · succeeded `✓` green · failed `✗` red ·
unsupported `×` yellow.

Remote-active header line (AppShell): `{remote} · agent {v} (active)` in cyan +
dim — decide coexistence with the breadcrumb when that screen is designed.
