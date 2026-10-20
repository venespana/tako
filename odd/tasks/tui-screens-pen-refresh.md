# TUI screens — pen refresh + status flow design

## Objective

Bring `design.pen` up to date with the implemented TUI (branch `feature/mvp-status-command`)
and design the status-flow screens as a mini-webapp-style dashboard, within the
established terminal-native design language (GitHub-dark palette, JetBrains Mono,
flat no-border layout, `❯` cursor).

## Problem & why

The pen has only Screen - Home and Screen - Doctor, and its App Header shows a
breadcrumb that the real shell does not have (real chrome: ASCII logo + active-remote
line, footer with per-page key hints). The app now also implements remotes selection,
connect gate, add-remote wizard, and the tasks workspace — none are in the pen.
`tako status` shipped in the CLI (mvp-status-command S1–S8) while the TUI StatusPage
is a stub: the status flow must be designed before wiring it.

## Design language (locked, from existing pen + repo evidence)

- Screen frame: 1040×640, vertical, padding [28,36], fill `$bg` (#0D1117), clip true.
- JetBrains Mono only; 14 body, 13 footer hints, 16 logo. No borders — spacing-driven.
- Tokens: `$text-primary #E6EDF3`, `$muted #8B949E`, `$accent #22D3EE`,
  `$success #3FB950`, `$error #F85149`, `$warning #D29922`. New: `$border #30363D`
  (1px dividers only, the webapp-structure touch).
- Chrome: App Header = logo + dim-cyan active-remote line
  (`homeserver · agent 0.2.0 (active)` / `no remote selected`); Footer = key hints
  (keys bold, labels muted) + version **v1.1.0** (matches repo after S8 bump).
- Components reused as refs; per-screen overrides via `descendants` by unique name.

## Status flow design (TUI StatusPage, currently `<Text>status</Text>` stub)

State machine: loading → ok | empty | refusal (refusal objects never render partial
data — strict-refusal convention). Entry context: active remote (host required,
mirrors CLI `--host <remote>` required). Mini-webapp = summary stat strip + master
stack table + detail column, echoing TasksPage's real two-column pane pattern.

## Checklist

- [x] T1 — Chrome: add `$border` token; Footer version → v1.1.0; App Header
      breadcrumb → Active Remote line; Home header uses App Header.
- [x] T2 — Doctor screen: verify tool-line overrides (5th = ✖ docker compose,
      4/5 summary), override active-remote to `no remote selected`.
- [x] T3 — Screen - Remotes (selection list, `name (endpoint)` rows).
- [x] T4 — Screen - Remote Connect (masked password gate, form-mode footer).
- [x] T5 — Screen - Add Remote (wizard mid-state: done rows + active port field,
      inline editing hint line, form-mode footer).
- [x] T6 — Screen - Tasks (agent line, Jobs list + History + Dry-run preview panes,
      browse hints n/r/a/e/d).
- [x] T7 — Screen - Status / Loading (connecting + fetching lines).
- [x] T8 — Screen - Status (dashboard: stat strip, stack table with colored status,
      detail column, `r refresh` hints). Canonical data from docs/commands.md +
      StackStatusEntry (name, status, configFiles).
- [x] T9 — Screen - Status / Empty (`no compose stacks found`).
- [x] T10 — Screen - Status / Error (refusal: SSH connection refused, `r retry`).
- [x] T11 — Final pass: screenshot every screen, fix alignment/contrast/clipping.
- [x] T12 — Screen - Home / Remote (y 1200, bajo Home): con remote activo,
      menú de comandos a la izquierda (solo acciones del host + salir:
      Status/Logs/Cleanup/Tasks/Exit — corrección del usuario: los grupos
      Local y Remote pertenecen al home sin remote) y panel con borde
      `$border` a la derecha mostrando el cuerpo del comando (estado, datos
      consistentes con el dashboard de Status).
- [x] T13 — Rediseño Screen - Home / Remote (requisito del usuario
      2026-10-20): sin menú de comandos; inventario de contenedores siempre
      visible agrupado por proyecto de compose + grupo Others (docker puro),
      semáforo por contenedor (verde running / rojo exited / amarillo
      paused), grupos colapsables (▼/▶); al seleccionar con el teclado, el
      panel derecho muestra las acciones del contenedor (View logs, Restart,
      Stop, Inspect; Start contextual); sección de acciones globales
      (r refresh · S status · T tasks · C cleanup) y Exit (E) separados.
- [x] T14 — Adaptación de flujo: Screen - Logs nueva (destino de la acción
      View logs del panel); Status dashboard + sus estados pasan a ser el
      destino de la acción global S; Tasks destino de T; Cleanup queda
      pendiente de diseño (C sin pantalla aún).
- [x] T15 — Tabs en Screen - Home / Remote (requisito 2026-10-20): Servicios
      y Global actions como pestañas con atajos `1`/`2`; tab bar con
      subrayado de pestaña activa (accent); el strip global se convierte en
      la pestaña Global actions (pantalla hermana en 2000,1200) con menú de
      acciones globales + Exit.
- [x] T16 — Screen - Cleanup (13200,480): confirmación destructiva de prune
      (panel con borde warning, qué se elimina, espacio recuperable,
      garantía de stacks corriendo intactos, prompt y/N) — completa el flujo
      de la acción global C. Revisión de flujo completo en Progreso.
- [x] T17 — Frame "Flow — tako screens" (880,1900): wireflow de las 14
      pantallas con conectores ortogonales etiquetados por atajo (navegación
      muted, Exit en error-rojo, hub con borde accent), estados de Status en
      cadena propia y leyenda.
- [x] T18 — Auditoría estética + reorganización del lienzo (2026-10-20):
      chrome uniforme verificado en las 14 (App Header + footer v1.1.0 +
      gaps de body); normalizados los gaps 8→12 (Connect, Add Remote,
      Status/Loading, Empty, Error) y 14→12 (Status dashboard); la familia
      de Status ahora usa el patrón heading+meta+divider (igual que
      Logs/Cleanup/Status). Lienzo reorganizado en grilla 7×2 con captions:
      ENTRY·LOCAL (Home, Doctor) / REMOTE SETUP (Remotes, Connect, Add) /
      REMOTE HUB·TABS (Servicios 6480,480, Global actions 7600,480) /
      DRILL-INS & ACTIONS fila y1200 (Logs, Loading, Status, Empty, Error,
      Tasks, Cleanup) / FLOW MAP (880,1900). Excepciones deliberadas:
      Doctor (estructura legacy, visualmente correcta), form-screens sin
      meta row (minimalismo de form mode), menú Home con gap 8 (ritmo de
      menú).

## Authorized scope

`design.pen` only (via pen.dev MCP tools). No source-code changes, no commits.

## Route declaration

All tasks inline (route: direct inline). Reason: pen mutations run exclusively
through this session's pencil MCP tools; subagents have no access. Verification =
structural (Get bounds/problems) + screenshot per finished screen.

## Acceptance criteria

- Every implemented TUI page has a faithful pen screen; chrome matches the real
  shell (no breadcrumb anywhere, active-remote line, v1.1.0 footer).
- Status flow covers loading/ok/empty/refusal with the strict-refusal convention.
- No clipped content, collapsed layout, or contrast failures on any screen.

## Progress

- 2026-10-19: feature doc created after repo + pen exploration. T1–T11 pending.
- 2026-10-19: T1–T11 completed, all inline via pen.dev MCP. Chrome updated
  (`$border #30363D`, footer v1.1.0, App Header breadcrumb → dim-cyan
  active-remote line with `no remote selected` / `homeserver · agent 0.2.0
  (active)` variants; Breadcrumb component kept in the components row, unused).
  New screens left→right after Doctor (y 480): Remotes, Remote Connect,
  Add Remote, Tasks, Status / Loading, Status, Status / Empty, Status / Error.
  Status data consistent: 6 stacks = 4 running (media/proxy/monitoring/
  homeassistant) + 2 stopped (backup exited(1), downloads paused); canonical
  empty string `no compose stacks found`; refusal = ssh connection refused.
  Form-mode screens (Connect, Add Remote, Loading) render footer with version
  only, matching the real EditingGuard/char-hints suppression.
- 2026-10-19: T12 added by user request and completed: Screen - Home / Remote
  at (880, 1200) — App Header with active remote, command menu (Host: Status
  focused/Logs/Cleanup/Tasks · Local: Doctor · Remote: Select/Add/Delete) and
  a `$border`-stroked body panel showing the status command body (6/4/2 stats,
  stack table, refresh hint) consistent with the Status dashboard data.
  Verified by screenshot.
- 2026-10-20: T12 superseded by user request — T13 redesign of Screen -
  Home / Remote built and verified: no command menu; always-visible container
  inventory grouped by compose project + Others (pure docker), per-container
  traffic light (● green running / red exited / yellow paused), collapsible
  groups (▼ media expanded 3 containers, ▶ collapsed groups, ▼ Others),
  right `$border` panel with the selected container's actions (View logs,
  Restart, Stop, Inspect + contextual Start note), global-actions strip
  (r refresh · S status · T tasks · C cleanup) with Exit (E) separated at
  the right. T14: Screen - Logs added at (12080, 480) as the View-logs
  destination (bordered log panel, INF/WRN colored levels, following state,
  f follow hints); flow mapping now: Home(no remote) → Select → Connect →
  Home/Remote inventory → [container actions → Logs; global S → Status
  dashboard (+ loading/empty/error); global T → Tasks; E → back to Home].
  Mock data coherent with the status screens (media/proxy/monitoring/
  homeassistant/backup/downloads + Others; 14 containers · 12 running).
  Pending: Cleanup screen design (C currently points nowhere).
- 2026-10-20: T15/T16 completed, verified by screenshot. T15: Home/Remote
  now has a tab bar (`1 Servicios` active accent / `2 Global actions` muted,
  2px underlines above a full-width divider); the global strip became the
  Global actions TAB — sister screen "Screen - Home / Remote / Global
  Actions" at (2000,1200) with a bordered action menu (Refresh, Status,
  Tasks, Cleanup marked `· destructive` yellow, Exit) and footer hints
  `↑↓/j k select · Enter/l run · 1/2 tab · h/Esc back · q quit`. T16:
  Screen - Cleanup at (13200,480) — destructive-confirm pattern: warning-
  stroked panel (⚠ line, prune commands, impact `1 stopped container ·
  ~2.3 GB reclaimable`, green guarantee `Running stacks are never touched.`,
  `[y/N]` prompt with cursor), WHAT GETS REMOVED detail section, footer
  `y confirm · N/Esc cancel`.
  Full flow map (final): Home(no remote: Doctor / Select / Add / Delete) →
  Remotes → Connect gate → Home/Remote[1] Servicios (inventory + container
  actions: View logs→Logs, Restart/Stop/Inspect inline) ⇄ [2] Global actions
  (Refresh · Status→Status dashboard + loading/empty/error · Tasks→Tasks
  workspace · Cleanup→Cleanup confirm · Exit→Home). All 14 screens verified;
  no dead ends left.
- 2026-10-20: T17 completed — "Flow — tako screens" wireflow frame at
  (880,1900), 1700×820, absolute layout: 14 screen nodes (hub nodes accent-
  bordered), orthogonal labeled connectors (Select/Enter/activate/Add/1-2/l/
  s/t/c), Status states chain (Loading/Empty/Error off the Status node), and
  the red Exit return path to Home. Legend: navigation vs exit vs direct
  keys. Gotcha: arrow/label text nodes need explicit fill even when the
  helper default is undefined — silent invisible text. Verified by
  screenshot after a fill pass.
- 2026-10-20: FLOW MAP frame deleted by the user (deliberate — the flow
  remains documented in this file); its caption went with it.
- 2026-10-20: TASK CLOSED by user decision — delivery is a direct commit on
  `feature/mvp-status-command`, no PR, no version bump (the bump rule
  applies to PRs; 1.1.0 already shipped with the status command).

## Delivery

- Committed: this feature document. `design.pen` is tracked in git but its
  local snapshot is stale at 55f16e9 (2026-10-01): pen.dev keeps the live
  document cloud-side and does not write the file on edit, so the 14-screen
  design is NOT yet in the local bytes. Syncing it requires an explicit
  save/export from pen.dev over the local file, then a follow-up commit.

## Route declaration (final)

All pen work inline (pencil MCP only exists in this session). No source code
changed; nothing to test or lint for the design artifact beyond the
screenshot verification recorded above.

## Verification evidence

- Every screen verified by pen.dev TakeScreenshot at build time (Remotes,
  Connect, Add Remote, Tasks, Status, Loading, Empty, Error, Home, Doctor):
  no clipping, no collapsed layout, column alignment correct, contrast
  within the GitHub-dark palette. Structural `Get ... problems` checks ran
  per call; the only recurring report (`YjUD4` fit_content collapse) is the
  pre-existing empty Items fallback of the Menu Group component definition
  (used deliberately by the Config group) — not touched.
- Tasks body needed one width fix (`fill_container` on the Body frame to
  break a fit/fill circular dependency with the Columns row) — fixed and
  re-verified by screenshot.
- No source files changed; `design.pen` mutations only (authorized scope
  respected).
