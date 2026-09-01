// useHomeNavigation.ts — Hook wrapping pure navigation functions.
// Cursor is local UI state; reads currentRoute from router store for cursor-reset effect.
import { useState, useCallback, useEffect } from 'react';

import {
  getSelectable,
  moveCursor,
  enterSubmenu as pureEnterSubmenu,
  exitSubmenu as pureExitSubmenu,
} from '../features/menu/navigation.js';
import { useRouterStore } from './router/index.js';
import type { ActionGroup, ViewState } from '../features/menu/types.js';

export interface UseHomeNavigationResult {
  /** Current view state */
  view: ViewState;
  /** Index into selectable[] that is currently focused */
  cursor: number;
  /** Items that are currently selectable (pre-filtered) */
  selectable: ReturnType<typeof getSelectable>;
  /** The original groups array */
  groups: ActionGroup[];
  /** Move cursor by +1 (down) or -1 (up) */
  moveCursor: (dir: 1 | -1) => void;
  /** Enter a submenu by parentId, saving current cursor for restore */
  enterSubmenu: (parentId: string) => void;
  /** Exit the current submenu, restoring cursor */
  exitSubmenu: () => void;
}

export function useHomeNavigation(groups: ActionGroup[], hasActiveRemote: boolean): UseHomeNavigationResult {
  const currentRoute = useRouterStore(s => s.currentRoute);
  const [view, setView] = useState<ViewState>({ view: 'list' });
  const [cursor, setCursor] = useState(0);

  const selectable = getSelectable(groups, view, hasActiveRemote);

  // Reset cursor to 0 whenever the route changes
  useEffect(() => {
    setCursor(0);
  }, [currentRoute]);

  const moveCursorFn = useCallback(
    (dir: 1 | -1) => {
      setCursor(prev => moveCursor(selectable, prev, dir));
    },
    [selectable]
  );

  const enterSubmenuFn = useCallback(
    (parentId: string) => {
      setView(pureEnterSubmenu(parentId, cursor));
    },
    [cursor]
  );

  const exitSubmenuFn = useCallback(() => {
    setView(pureExitSubmenu(view));
  }, [view]);

  return {
    view,
    cursor,
    selectable,
    groups,
    moveCursor: moveCursorFn,
    enterSubmenu: enterSubmenuFn,
    exitSubmenu: exitSubmenuFn,
  };
}
