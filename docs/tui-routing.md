# TUI routing (file-based routes)

File-based route convention for the TUI. Every `.tsx` file in
`src/tui/app/routes/` is a thin shim that re-exports a screen from a lower
FSD layer (`pages/`, `widgets/`); shims contain no logic.
`scripts/generate-routes.ts` scans that directory and emits the typed route
tree consumed by the router.

## File convention

| File         | Route                                               |
| ------------ | --------------------------------------------------- |
| `layout.tsx` | Layout route wrapping its sibling routes (optional) |
| `index.tsx`  | Index route at its directory's exact path           |
| `name.tsx`   | Child route at `/<dir>/name`                        |
| `subdir/`    | Nested path prefix `/<dir>/subdir/...`              |

- `layout.tsx` is **optional** per directory. Add one only when the path
  prefix needs shared chrome around its children. The **root**
  `routes/layout.tsx` is required and wraps the whole app in the
  `AppShell` widget.
- A subdirectory without `layout.tsx` becomes a **module-less** path
  prefix: a route node with a path and children but no component
  (react-router renders an implicit `Outlet` for it).

## Naming rules

- The file basename **is** the URL segment, verbatim (`list.tsx` →
  `/remotes/list`). Use lowercase `kebab-case` (`add-remote.tsx` →
  `/add-remote`); the name must be a literal URL path segment.
- Reserved names: `layout.tsx` and `index.tsx` (their route semantics from
  the table above).
- Every non-test `.tsx` file in the routes directory becomes a route — do
  not place arbitrary components there. `*.test.tsx` are excluded from the
  scan; `.ts` files are never scanned.
- Dynamic segments (`:id`, splats) are not supported by the convention.
- Shim module contract: a `default` export (the screen component) plus an
  optional named `routeMeta` export. Nothing else is consumed.

## `routeMeta` / `RouteHandle`

A shim's module may export `routeMeta: RouteHandle`
(see `src/tui/shared/lib/route-tree.ts`). The generator attaches it to the
route's `handle`, where the shell reads it at runtime — currently the
`menu: 'home' | 'submenu'` hint that switches the footer between
movement/select hints and back/quit-only hints. Omit `routeMeta` for
command pages.

## Generated tree

`bun run generate:routes` emits **`src/tui/app/routes.generated.ts`** —
committed to the repo, **DO NOT EDIT** (like TanStack's `routeTree.gen.ts`).
It is structure-guarded by `src/tui/app/routes.generated.test.ts`.
Regenerate after adding, moving, or removing any file in the routes
directory.
