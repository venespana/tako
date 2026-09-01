// router-store.ts — Zustand store wrapping the pure router logic.

import { create } from 'zustand';
import { navigate, goBack } from './router-logic.js';
import type { RouteName, RouteParams, RouterState, HistoryEntry } from './types.js';

interface RouterActions {
  /** Navigate to a route, optionally with params. */
  navigate: (route: RouteName, params?: RouteParams) => void;
  /** Pop the history stack; exits TUI when history is empty. */
  goBack: () => void;
}

export type RouterStore = RouterState & RouterActions;

/** Single exit handler injected from App.tsx via useApp().exit. */
let _exitHandler: (() => void) | null = null;

/**
 * Wire Ink's exit primitive once from App.tsx.
 * Must be called before the store is used.
 */
export function setExitHandler(fn: () => void): void {
  _exitHandler = fn;
}

export const useRouterStore = create<RouterStore>((set, get) => ({
  currentRoute: 'home',
  params: {},
  history: [] as HistoryEntry[],

  navigate: (route: RouteName, params?: RouteParams) => {
    set(prev => navigate(prev, route, params));
  },

  goBack: () => {
    const { exited } = goBack(get());
    if (exited) {
      _exitHandler?.();
    } else {
      set(prev => goBack(prev).state);
    }
  },
}));
