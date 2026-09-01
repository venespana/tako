// create-router.ts — Router factory (TanStack-inspired, headless).
// Creates an isolated router instance: per-instance Zustand store, exit handler,
// and React hooks bound to the instance. No module-level state exists.

import { useStore } from 'zustand';
import type { StoreApi } from 'zustand';

import { DEFAULT_HISTORY_LIMIT } from './router-logic.js';
import { createRouterStore } from './router-store.js';
import type { RouterStore } from './router-store.js';
import type { RouteParams, RouterOptions, RouterState, Router } from './types.js';

/**
 * Create a router instance.
 *
 * The exit handler is NOT wired here — the host app calls
 * `setExitHandler(exit)` (e.g. with Ink's `useApp().exit`) after creation.
 */
export function createRouter<TRouteName extends string>(options: RouterOptions<TRouteName>): Router<TRouteName> {
  const { initialRoute, initialParams = {}, historyLimit = DEFAULT_HISTORY_LIMIT } = options;

  const store = createRouterStore<TRouteName>({ initialRoute, initialParams, historyLimit });

  // Instance-scoped exit handler, injected by the host app.
  let exitHandler: (() => void) | null = null;

  const navigate = (route: TRouteName, params?: RouteParams): void => {
    store.getState().navigate(route, params);
  };

  const goBack = (): boolean => {
    const exited = store.getState().goBack();
    if (exited) {
      exitHandler?.();
    }
    return exited;
  };

  const setExitHandler = (fn: (() => void) | null): void => {
    exitHandler = fn;
  };

  const getState = (): RouterState<TRouteName> => {
    const { currentRoute, params, history } = store.getState();
    return { currentRoute, params, history };
  };

  const subscribe = (listener: () => void): (() => void) => store.subscribe(listener);

  const reset = (): void => {
    store.setState({ currentRoute: initialRoute, params: initialParams, history: [] });
  };

  // Hooks bound to this instance via the per-instance store. Like zustand's
  // own factory hooks, these must be called from React components.
  const useCurrentRoute = (): TRouteName =>
    useStore<StoreApi<RouterStore<TRouteName>>, TRouteName>(store, s => s.currentRoute);
  const useParams = (): RouteParams => useStore<StoreApi<RouterStore<TRouteName>>, RouteParams>(store, s => s.params);
  const useNavigate = () => navigate;
  const useGoBack = () => goBack;

  return {
    navigate,
    goBack,
    setExitHandler,
    getState,
    subscribe,
    reset,
    useCurrentRoute,
    useParams,
    useNavigate,
    useGoBack,
  };
}
