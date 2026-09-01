// use-menu-keyboard.ts — App-layer hook owning the TUI's keyboard interaction
// model: Ink input handling, the home cursor (with reset-on-route-change),
// route-aware menu derivation, and Ink exit wiring. App.tsx consumes it and
// keeps only the router lookup, screen mounting, and logo conditional.
import { useEffect, useMemo, useState } from 'react';

import { useApp, useInput } from 'ink';
import type { Key } from 'ink';

import { appRouter } from './app-router.js';
import { isAppRoute } from './routes.js';
import type { RouteName } from './routes.js';
import { getSelectableForRoute, moveCursor } from '../features/menu/index.js';
import type { ActionGroup, ActionItem } from '../features/menu/index.js';

export interface UseMenuKeyboardOptions {
  /** Whether a remote is currently configured (gates hasActiveRemote items). */
  hasActiveRemote: boolean;
}

/** Everything App needs to render the active screen. */
export interface MenuKeyboardModel {
  /** Selectable items for the current route (already filtered). */
  selectable: ActionItem[];
  /** Groups the current screen should render. */
  screenGroups: ActionGroup[];
  /** Focused index into `selectable`. */
  cursor: number;
}

export function useMenuKeyboard({ hasActiveRemote }: UseMenuKeyboardOptions): MenuKeyboardModel {
  const { exit } = useApp();

  // Router state (instance-bound hooks from the shared router factory)
  const currentRoute = appRouter.useCurrentRoute();
  const navigate = appRouter.useNavigate();
  const goBack = appRouter.useGoBack();

  // Home cursor is local UI state (not router state), reset on route change.
  // Adjusting state during render (instead of an effect) avoids a stale-cursor
  // frame and cascading effect renders — react.dev's reset-on-change pattern.
  const [cursor, setCursor] = useState<number>(0);
  const [lastRoute, setLastRoute] = useState<RouteName>(currentRoute);
  if (lastRoute !== currentRoute) {
    setLastRoute(currentRoute);
    setCursor(0);
  }

  // Compute the menu model (selectable/screenGroups/isNavigable) for the route
  const { selectable, screenGroups, isNavigable } = useMemo(
    () => getSelectableForRoute(currentRoute, hasActiveRemote),
    [currentRoute, hasActiveRemote]
  );

  // Wire Ink exit to the router instance once.
  // Terminal cleanup is handled by Ink's alternateScreen at the composition root —
  // never write raw escape sequences here: they corrupt Ink's frame sync.
  useEffect(() => {
    appRouter.setExitHandler(exit);
  }, [exit]);

  // handleKey doesn't need memoization since useInput re-registers on each render
  const handleKey = (input: string, key: Key) => {
    // Quit on q or Ctrl-C (only Ctrl-C — other ctrl combos must not exit)
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
      return;
    }

    // Navigation (cursor movement only works on menu-navigable routes)
    if (isNavigable) {
      if (key.upArrow || input === 'k') {
        setCursor(prev => moveCursor(selectable, prev, -1));
        return;
      }
      if (key.downArrow || input === 'j') {
        setCursor(prev => moveCursor(selectable, prev, 1));
        return;
      }
    }

    // Back — always active, returns to previous route or exits on home
    if (key.escape || key.backspace || input === 'h') {
      goBack();
      return;
    }

    // Select / Enter — navigate when the focused item carries a valid route
    // (submenu parents and routed actions alike; only on navigable routes)
    if (key.return || input === 'l') {
      if (!isNavigable) return;
      const focused = selectable[cursor];
      if (!focused) return;

      if (focused.route !== undefined && isAppRoute(focused.route)) {
        navigate(focused.route);
      }
    }
  };

  useInput(handleKey);

  return { selectable, screenGroups, cursor };
}
