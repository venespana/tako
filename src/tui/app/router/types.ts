// types.ts — Router type definitions.

/**
 * Canonical route set for the TUI.
 * Note: 'remotes' is the parent submenu route; 'remotes.*' are the child routes.
 */
export type RouteName =
  | 'home'
  | 'remotes'
  | 'remotes.add'
  | 'remotes.list'
  | 'remotes.rm'
  | 'remotes.use'
  | 'remotes.test'
  | 'doctor'
  | 'logs'
  | 'status'
  | 'cleanup';

/** Opaque params object scoped to the current route. */
export type RouteParams = Record<string, unknown>;

/** A single history stack entry. */
export interface HistoryEntry {
  route: RouteName;
  params: RouteParams;
}

/** Raw router state — the pure data layer. */
export interface RouterState {
  currentRoute: RouteName;
  params: RouteParams;
  history: HistoryEntry[];
}
