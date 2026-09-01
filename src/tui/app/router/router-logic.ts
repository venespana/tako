// router-logic.ts — Pure navigation transition functions.
// No side effects; all inputs and outputs are explicit.

import type { RouteName, RouteParams, RouterState, HistoryEntry } from './types.js';

const HISTORY_CAP = 20;

/**
 * navigate(state, route, params) — push current route onto history, switch to new route.
 *
 * - Same-route: update params in place, history untouched (dedup).
 * - Cross-route: push prior {route, params} onto history (capped at 20).
 */
export function navigate(state: RouterState, route: RouteName, params: RouteParams = {}): RouterState {
  if (state.currentRoute === route) {
    // Deduplication: same route → only params change
    return { ...state, params };
  }

  const prior: HistoryEntry = { route: state.currentRoute, params: state.params };
  const history = [...state.history, prior].slice(-HISTORY_CAP);

  return { currentRoute: route, params, history };
}

/**
 * goBack(state) — pop the most recent history entry.
 *
 * Returns { state, exited } where exited is true when history was empty
 * (caller should invoke the TUI exit primitive).
 */
export function goBack(state: RouterState): { state: RouterState; exited: boolean } {
  if (state.history.length === 0) {
    // Empty history → request exit
    return { state, exited: true };
  }

  const reversed = [...state.history].reverse();
  const prev = reversed[0]!;
  const rest = reversed.slice(1);
  return {
    state: { currentRoute: prev.route, params: prev.params, history: rest.reverse() },
    exited: false,
  };
}
