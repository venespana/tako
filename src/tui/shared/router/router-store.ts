// router-store.ts — Internal per-instance Zustand store wrapping the pure router logic.
// No module-level store exists; every router factory call creates one of these.

import { createStore } from 'zustand';
import type { StoreApi } from 'zustand';

import { navigate, goBack } from './router-logic.js';
import type { RouteParams, RouterOptions, RouterState } from './types.js';

/** State + actions held by one router instance's store. */
export interface RouterStore<TRouteName extends string> extends RouterState<TRouteName> {
  /** Navigate to a route, optionally with params. */
  navigate: (route: TRouteName, params?: RouteParams) => void;
  /** Apply the back transition; returns true when history was empty (exit signal). */
  goBack: () => boolean;
}

/**
 * Create the Zustand store backing a single router instance.
 * Exited goBack leaves state untouched — the exit decision belongs to the factory.
 */
export function createRouterStore<TRouteName extends string>(
  options: RouterOptions<TRouteName>
): StoreApi<RouterStore<TRouteName>> {
  const { initialRoute, initialParams = {}, historyLimit } = options;

  return createStore<RouterStore<TRouteName>>((set, get) => ({
    currentRoute: initialRoute,
    params: initialParams,
    history: [],

    navigate: (route: TRouteName, params?: RouteParams) => {
      set(prev => navigate(prev, route, params, historyLimit));
    },

    goBack: () => {
      const { exited, state } = goBack(get());
      if (!exited) {
        set(state);
      }
      return exited;
    },
  }));
}
