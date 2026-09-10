// use-menu-list.ts — Menu interaction hook for menu pages: owns the cursor
// state and the list keyboard model (up/k, down/j move; Enter/l select).
// Each page mounts its own instance, so the cursor starts at 0 naturally —
// navigating between pages remounts them and the reset-on-route-change
// pattern disappears entirely. Consumed by menu pages together with
// use-menu-navigation (route navigation used to be page-owned; the two
// duplicated inline handlers were extracted into that hook).
//
// When `isActive` is false (e.g. during text input), this hook is a no-op so
// that h/j/k/l characters reach the text input without being intercepted.
import { useCallback, useRef, useState } from 'react';

import { useInput } from 'ink';
import type { Key } from 'ink';

import type { ActionItem } from './menu-items.js';
import { moveCursor } from './menu-navigation.js';
import { useEditing } from '../../../shared/lib/editing-context.js';

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

export function useMenuList(
  { selectable, onSelect }: UseMenuListOptions,
  isActive: boolean = true
): MenuListController {
  const [cursor, setCursor] = useState(0);
  const { isEditing } = useEditing();

  const active = isActive && !isEditing;

  // Keep a ref to the current selectable so the keyboard handler always
  // operates on the latest value, avoiding stale-closure issues when the
  // list populates after the initial render (React 19 may delay passive
  // effects, so useInput can register before the async fetch resolves).
  const selectableRef = useRef(selectable);
  selectableRef.current = selectable;

  const handleKey = useCallback(
    (input: string, key: Key): void => {
      if (key.upArrow || input === 'k') {
        setCursor(prev => moveCursor(selectableRef.current, prev, -1));
        return;
      }
      if (key.downArrow || input === 'j') {
        setCursor(prev => moveCursor(selectableRef.current, prev, 1));
        return;
      }
      // Select — focused item only; registry items always carry a route but the
      // undefined-guard keeps the hook safe for non-routed lists too.
      if (key.return || input === 'l') {
        const focused = selectableRef.current[cursor];
        if (focused !== undefined) onSelect(focused);
      }
    },
    [onSelect, cursor]
  );

  useInput(handleKey, { isActive: active });

  return { cursor };
}
