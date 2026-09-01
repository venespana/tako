// types.ts — Router type definitions (generic over the route-name union).
// This module is app-agnostic: no route names, screens, or UI live here.

/** Opaque params object scoped to the current route. */
export type RouteParams = Record<string, unknown>;

/** A single history stack entry. */
export interface HistoryEntry<TRouteName extends string = string> {
  route: TRouteName;
  params: RouteParams;
}

/** Raw router state — the pure data layer. */
export interface RouterState<TRouteName extends string = string> {
  currentRoute: TRouteName;
  params: RouteParams;
  history: HistoryEntry<TRouteName>[];
}

/** Options accepted by the router factory. */
export interface RouterOptions<TRouteName extends string> {
  /** Route the router starts on. */
  initialRoute: TRouteName;
  /** Params for the initial route. */
  initialParams?: RouteParams;
  /** Maximum history entries kept; oldest are dropped. Default 20. */
  historyLimit?: number;
}

/**
 * A router instance: imperative API + React hooks bound to this instance.
 * Created via `createRouter` — never instantiated directly.
 */
export interface Router<TRouteName extends string> {
  /** Navigate to a route, optionally with params. */
  navigate(route: TRouteName, params?: RouteParams): void;
  /** Pop the history stack. Returns false when history was empty → the exit signal fired. */
  goBack(): boolean;
  /** Wire (or clear with null) the handler fired when goBack hits empty history. */
  setExitHandler(fn: (() => void) | null): void;
  /** Snapshot of the current router state. */
  getState(): RouterState<TRouteName>;
  /** Subscribe to state changes; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Restore the initial route/params and clear history (tests, HMR). */
  reset(): void;
  // React hooks bound to this instance
  useCurrentRoute(): TRouteName;
  useParams(): RouteParams;
  useNavigate(): (route: TRouteName, params?: RouteParams) => void;
  useGoBack(): () => void;
}
