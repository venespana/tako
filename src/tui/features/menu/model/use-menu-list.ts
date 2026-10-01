// use-menu-list.ts — Menu interaction hook for menu pages: owns the cursor
// state and the list keyboard model (up/k, down/j move; Enter/l select —
// dispatched by the shared useKeyBindings hook, 9.9). Each page mounts its
// own instance, so the cursor starts at 0 naturally — navigating between
// pages remounts them and the reset-on-route-change pattern disappears
// entirely. Consumed by menu pages together with use-menu-navigation (route
// navigation used to be page-owned; the two duplicated inline handlers were
// extracted into that hook).
//
// When `isActive` is false (e.g. during text input), this hook is a no-op so
// that h/j/k/l characters reach the text input without being intercepted.
import { useState } from 'react';

import type { ActionItem } from './menu-items.js';
import { moveCursor } from './menu-navigation.js';
import { useEditingStore } from '../../../shared/lib/editing-store.js';
import { useKeyBindings } from '../../../shared/lib/use-key-bindings.js';

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
  const isEditing = useEditingStore(state => state.isEditing);

  const active = isActive && !isEditing;

  // ink's useInput (under the shared hook) wraps the handler in useEffectEvent,
  // which always invokes the handler from the latest committed render — so
  // reading `selectable`/`cursor` directly is safe even when the list
  // populates after the initial render.
  const selectFocused = () => {
    const focused = selectable[cursor];
    if (focused !== undefined) onSelect(focused);
  };

  useKeyBindings(
    {
      moveUp: () => setCursor(previous => moveCursor(selectable, previous, -1)),
      moveDown: () => setCursor(previous => moveCursor(selectable, previous, 1)),
      // Select — focused item only; registry items always carry a route but the
      // undefined-guard keeps the hook safe for non-routed lists too. `l` is
      // the menu's pre-existing vim-right select, declared explicitly (the
      // shared hook stays neutral: confirm = return only).
      confirm: () => selectFocused(),
      chars: { l: () => selectFocused() },
    },
    { isActive: active }
  );

  return { cursor };
}
