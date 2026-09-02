// use-menu-list.ts — Menu interaction hook for menu pages: owns the cursor
// state and the list keyboard model (up/k, down/j move; Enter/l select).
// Each page mounts its own instance, so the cursor starts at 0 naturally —
// navigating between pages remounts them and the reset-on-route-change
// pattern disappears entirely. Consumed by menu pages together with
// use-menu-navigation (route navigation used to be page-owned; the two
// duplicated inline handlers were extracted into that hook).
import { useState } from 'react';

import { useInput } from 'ink';
import type { Key } from 'ink';

import type { ActionItem } from './menu-items.js';
import { moveCursor } from './menu-navigation.js';

export interface UseMenuListOptions {
  /** The currently selectable items (pre-filtered by enablement). */
  selectable: ActionItem[];
  /** Called with the focused item on Enter/l; guarded against an empty list. */
  onSelect: (item: ActionItem) => void;
}

export interface MenuListController {
  /** Index into `selectable` that is currently focused. */
  cursor: number;
}

export function useMenuList({ selectable, onSelect }: UseMenuListOptions): MenuListController {
  const [cursor, setCursor] = useState(0);

  // handleKey doesn't need memoization since useInput re-registers on each render
  const handleKey = (input: string, key: Key): void => {
    if (key.upArrow || input === 'k') {
      setCursor(prev => moveCursor(selectable, prev, -1));
      return;
    }
    if (key.downArrow || input === 'j') {
      setCursor(prev => moveCursor(selectable, prev, 1));
      return;
    }
    // Select — focused item only; registry items always carry a route but the
    // undefined-guard keeps the hook safe for non-routed lists too.
    if (key.return || input === 'l') {
      const focused = selectable[cursor];
      if (focused !== undefined) onSelect(focused);
    }
  };

  useInput(handleKey);

  return { cursor };
}
