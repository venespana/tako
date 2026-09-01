// use-menu-keyboard.ts — App-layer hook owning the TUI's keyboard interaction
// model: Ink input handling, the active menu cursor (reset on path change),
// matches-driven menu derivation, navigation, and Ink exit wiring. Consumed
// by AppShell; router state comes from the react-router data router hooks.
import { useMemo, useState } from 'react';

import { useApp, useInput } from 'ink';
import type { Key } from 'ink';

import { useLocation, useMatches, useNavigate } from 'react-router';

import { getMenuFlowForMatches, moveCursor } from '../features/menu/index.js';
import type { ScreenProps } from '../features/menu/index.js';

export interface UseMenuKeyboardOptions {
  /** Whether a remote is currently configured (gates hasActiveRemote items). */
  hasActiveRemote: boolean;
}

export function useMenuKeyboard({ hasActiveRemote }: UseMenuKeyboardOptions): ScreenProps {
  const { exit } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const matches = useMatches();

  // Compute the menu model (selectable/screenGroups/isNavigable) for the
  // matched route chain: home registry on '/', the remotes submenu on
  // /remotes/* (inherited by children), nothing on isolated stub routes.
  const { selectable, screenGroups, isNavigable } = useMemo(
    () => getMenuFlowForMatches(matches, hasActiveRemote),
    [matches, hasActiveRemote]
  );

  // Cursor is local UI state, reset on path change. Adjusting state during
  // render (instead of an effect) avoids a stale-cursor frame and cascading
  // effect renders — react.dev's reset-on-change pattern.
  const [cursor, setCursor] = useState<number>(0);
  const [lastPathname, setLastPathname] = useState<string>(location.pathname);
  if (lastPathname !== location.pathname) {
    setLastPathname(location.pathname);
    setCursor(0);
  }

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

    // Back — always active. At home or on the initial history entry there is
    // nothing to pop (navigate(-1) would be a no-op), so exit instead.
    if (key.escape || key.backspace || input === 'h') {
      if (location.pathname === '/' || location.key === 'default') exit();
      else navigate(-1);
      return;
    }

    // Select / Enter — navigate to the focused item's path (registry items
    // only ever carry valid route paths; same path is deduped as a no-op)
    if (key.return || input === 'l') {
      if (!isNavigable) return;
      const focused = selectable[cursor];
      if (focused?.route === undefined) return;
      if (location.pathname === focused.route) return;
      navigate(focused.route);
    }
  };

  useInput(handleKey);

  return { groups: screenGroups, selectable, cursor };
}
