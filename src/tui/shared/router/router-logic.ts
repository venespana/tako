// router-logic.ts — Pure navigation transition functions.
// No side effects; all inputs and outputs are explicit.

import type { HistoryEntry, RouteParams, RouterState } from './types.js';

export const DEFAULT_HISTORY_LIMIT = 20;

/**
 * navigate(state, route, params, historyLimit) — push current route onto history,
 * switch to the new route.
 *
 * - Same-route: update params in place, history untouched (dedupe).
 * - Cross-route: push prior {route, params} onto history (capped at historyLimit).
 */
export function navigate<TRouteName extends string>(
  state: RouterState<TRouteName>,
  route: TRouteName,
  params: RouteParams = {},
  historyLimit: number = DEFAULT_HISTORY_LIMIT
): RouterState<TRouteName> {
  if (state.currentRoute === route) {
    // Deduplication: same route → only params change
    return { ...state, params };
  }

  const prior: HistoryEntry<TRouteName> = { route: state.currentRoute, params: state.params };
  const history = [...state.history, prior].slice(-historyLimit);

  return { currentRoute: route, params, history };
}

/**
 * goBack(state) — pop the most recent history entry.
 *
 * Returns { state, exited } where exited is true when history was empty
 * (caller should fire the exit signal).
 */
export function goBack<TRouteName extends string>(
  state: RouterState<TRouteName>
): { state: RouterState<TRouteName>; exited: boolean } {
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
