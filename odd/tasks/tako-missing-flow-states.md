# Tako — missing flows: intermediate loading / empty / error screens

## Objective

Audit the designs that exist today against the states the TUI actually renders,
define the gaps, and produce the missing screens as a FigCraft design file.
Branch: `designs`. Delivery: one design artifact (`tako.figcraft`) + docs; no
source-code change. Test runner: none (design artifact) — verification is
structural inspection + per-screen screenshots in FigCraft.

## Specs

- **S1** — "revisa los actuales y define los que faltan" — every screen the TUI
  can render must exist in a design surface, and the audit must name the gaps.
- **S2** — "las patallas intermedias de errores y cargas" — every intermediate
  state (loading, empty, error, in-progress, terminal wizard steps) gets its own
  screen, with the strings the code actually prints.
- **S3** — "usa figcraft" — the new designs live in a FigCraft file, reusing the
  design-system tokens and components from `docs/design.md`.
- **S4** — "generemos los diseños de los flujos faltantes en la app" — the
  output is a design artifact, not code.
- **S5** — "Has un rebase con main" — the branch carries the current `main`
  before any design work continues.
- **S6** — "revisa los flujos guardados en el diseño original organizarlos" —
  the Pencil canvas is audited against the code and regrouped by flow.
- **S7** — "añade los que creaste en el otro flujo" — the FigCraft screens
  join the Pencil canvas, so one file holds every screen.

## Audit — what existed before

Pencil canvas (`design.pen`, 14 screens): Home, Doctor, Remotes, Remote Connect,
Add Remote, Home / Remote, Home / Remote / Global Actions, Logs, Status
(+ Loading / Empty / Error), Tasks, Cleanup.

Implemented TUI pages (`src/tui/pages`): home, doctor, remotes-list,
remotes-menu, remotes-use, remotes-add, remotes-rm, remotes-test, remote-home,
status, logs, tasks, cleanup.

Gap = state the code renders with no screen in the Pencil canvas.
21 screens, all designed in `tako.figcraft`.

## Tasks

| Task | Specs | Route | Status | Evidence |
| --- | --- | --- | --- | --- |
| T1 — audit existing pen screens vs implemented TUI states | S1 | inline | done | this document, "Audit" + "Gap inventory" |
| T2 — FigCraft design system (tokens, 12 components) | S3 | inline | done | `tako.figcraft` → `Chrome / *` components |
| T3 — 21 missing state screens | S2, S4 | inline | done | `tako.figcraft` → `Screen — *` frames |
| T4 — reference map + `docs/design.md` section | S1, S3 | inline | done | `tako.figcraft` "STATE → SOURCE" frame; `docs/design.md` |
| T5 — commit `tako.figcraft` + docs | S4 | — | pending user approval | — |
| T6 — rebase `designs` onto `main` | S5 | inline | done | `git rebase main` → fast-forward `7cfab4e` → `398d17d` |
| T7 — audit the Pencil canvas against the rebased code, regroup by flow | S6 | inline | done | findings 5–6 below; 13 bands in `design.pen` |
| T8 — merge the FigCraft screens into the Pencil canvas | S7 | inline | done | `design.pen` holds 35 screens; text-parity + structural checks clean |

## Gap inventory (21 screens)

| Group | Screen | Code source |
| --- | --- | --- |
| Remote hub | Home / Remote / Loading | `pages/remote-home/ui/RemoteHomeLoading.tsx` |
| Remote hub | Home / Remote / Empty | `pages/remote-home/ui/RemoteHomeEmpty.tsx` |
| Remote hub | Home / Remote / Error | `pages/remote-home/ui/RemoteHomeError.tsx` |
| Logs | Logs / Connecting | `pages/logs/ui/LogsDashboard.tsx` (phase `connecting`) |
| Logs | Logs / Ended | `pages/logs/ui/LogsDashboard.tsx` (phase `ended`) |
| Logs | Logs / Error | `pages/logs/ui/LogsError.tsx` |
| Remotes | Remotes / Loading | `pages/remotes-menu/ui/RemotesMenuPage.tsx` |
| Remotes | Remotes / Error | `pages/remotes-menu/ui/RemotesMenuPage.tsx` |
| Remotes | Remotes / Empty | `pages/remotes-menu/ui/RemotesMenuPage.tsx` |
| Connect gate | Remote Connect / Validating | `pages/remotes-menu/ui/RemotesMenuPage.tsx` (gate) |
| Connect gate | Remote Connect / Error | `pages/remotes-menu/ui/RemotesMenuPage.tsx` (gate) |
| Doctor | Doctor / Checking | `features/doctor/ui/CheckingState.tsx` |
| Doctor | Doctor / Error | `features/doctor/ui/ErrorState.tsx` |
| Add Remote | Add Remote / Validating | `pages/remotes-add/model/use-add-remote-wizard.ts` |
| Add Remote | Add Remote / Host Key | `pages/remotes-add/ui/AddRemoteWizard.tsx` |
| Add Remote | Add Remote / Saved | `pages/remotes-add/ui/AddRemoteWizard.tsx` |
| Add Remote | Add Remote / Error | `pages/remotes-add/ui/AddRemoteWizard.tsx` |
| Tasks | Tasks / Agent Install | `pages/tasks/ui/AgentInstallPanel.tsx` |
| Tasks | Tasks / Agent Install Failed | `pages/tasks/ui/AgentInstallPanel.tsx` |
| Tasks | Tasks / No Dry-run | `pages/tasks/ui/DryRunPreviewPane.tsx` |
| Global | Route Error | `shared/ui/RouteErrorScreen.tsx` |

## Findings (design-relevant, not fixed here)

1. **Five routes are 6-line stubs**: `remotes-list`, `remotes-use`, `remotes-rm`,
   `remotes-test` and `cleanup` render their route name as text. The Cleanup
   screen in the Pencil canvas therefore designs a flow the code does not
   implement yet.
2. **The hub states break the app's own pattern.** `StatusLoading`/`StatusError`
   render `heading + meta + divider`; `RemoteHomeLoading`/`RemoteHomeError`
   render bare lines with no heading, so the hub's states break the visual
   rhythm the Status family sets.
3. **Footer hints leak into unusable states.** `/remotes` and `/remote-home`
   are menu routes (`routeMeta = { menu: true }`), so their loading / empty /
   error states still advertise `↑↓/j k  Enter/l select` even though nothing
   is selectable. The FigCraft screens reproduce this faithfully.
4. **No empty state for Logs.** `use-live-logs` has no empty phase; an ended
   stream shows its last lines with `r reconnect`.
5. **The canvas footer version was stale** — the `Footer` component said
   `v1.1.0` while the repo shipped `0.4.1` (and `0.7.0` after the rebase).
   Fixed at the component, so every screen inherits it.
6. **The hub screen missed the health badge.** After the rebase, the inventory
   rows render the healthcheck outcome as a word after the container name
   (`healthy` green / `unhealthy` red, `RemoteHomeDashboard.tsx:138`); the
   canvas had no such element. Added to the `immich` and `plex` rows.

## Log

- **L1** (2026-11-12) — "quiero que generemos los diseños de los flujos
  faltantes en la app para esto usa figcraft, pero antes recuerda que debemos
  revisar los actuales y definir los que faltan y las patallas intermedias de
  errores y cargas"
- **L2** (2026-11-13) — "Has un rebase con main y revisa los flujos guardados
  en el diseño original organizarlos y añade los que creaste en el otro flujo"
- 2026-11-12: audited `design.pen` (14 screens) against `src/tui` state
  components; 21 states had no screen. Subagent delegation was refused by
  permissions, so the audit ran inline (CodeGraph + direct reads).
- 2026-11-12: built `tako.figcraft` — page "Tako — Missing flows", 9 color
  variables + 1 font variable, 12 components (`Chrome / Logo`, 3 `Chrome / App
  Header` variants, 8 `Chrome / Footer` variants), 21 screens, group captions
  and a `STATE → SOURCE` reference map.
- 2026-11-12: footer version corrected to `v0.4.1` (the Pencil canvas still
  says `v1.1.0`; the current repo version is `0.4.1`).
- 2026-11-12: screen layout follows the real terminal — logo + active-remote
  line at the top, body 2 lines below it, footer pinned to the bottom — not the
  Pencil canvas' `space_between` centring.
- 2026-11-12: verified per screen with FigCraft screenshots (no clipping, no
  white fills, no collapsed rows) and saved `tako.figcraft`.
- 2026-11-13: rebased `designs` onto `main` (`7cfab4e` → `398d17d`, a
  fast-forward; nine commits of live-logs, hub container actions and status
  healthcheck work came with it). The state components the 21 screens cover
  are untouched by that range, so the screens stay valid.
- 2026-11-13: audit of the Pencil canvas against the rebased code → findings
  5 (stale footer version) and 6 (missing health badge) fixed in place; the
  canvas regrouped into 13 labelled bands (T7).
- 2026-11-13: merged the 21 FigCraft screens into `design.pen` (T8) by
  converting the FigCraft node tree into the Pencil schema — screens reuse the
  canvas' `App Header` and `Footer` components with the same
  `descendants` override mechanism the existing screens use; two new header
  components (`App Header / No Agent`, `App Header / No Remote`) cover the
  sessions without an active remote or without an agent version.
  Verified: 35 screens, 13 captions, 862 unique ids (no duplicates), every
  `ref` resolves to a reusable component, every `$variable` exists, no
  overlapping screens, and a text-parity check against the FigCraft source
  reports zero differences on all 35 screens.

## Next steps

- Commit `design.pen` + `tako.figcraft` + the doc updates (awaiting approval).
- The Pencil live document is cloud-side: import the local `design.pen` back
  into pen.dev, or a later cloud export will overwrite the 21 merged screens.
- Decide whether FigCraft stays a second surface or the Pencil canvas becomes
  the only one (`design.pen` now holds every screen).
- Feed findings 1–3 and 6 back into the code as an ODD feature (stub routes,
  hub state pattern, footer hints on unusable states, health badge in the
  hub's mock data).
