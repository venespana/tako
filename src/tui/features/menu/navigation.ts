// navigation.ts — Pure navigation functions for the menu feature.
// These are pure (no side effects, no React hooks) making them trivial to unit-test.

import type { ActionGroup, ActionItem, ViewState } from './types.js';

/** Returns only the selectable ActionItems for the current view.
 * Submenu parent items (kind === 'submenu') ARE included in the flat selectable list
 * because selecting them triggers router navigation to the submenu root.
 * Disabled items (enabledWhen: 'hasActiveRemote' with hasActiveRemote=false) are excluded. */
export function getSelectable(groups: ActionGroup[], _view: ViewState, hasActiveRemote: boolean): ActionItem[] {
  const selectable: ActionItem[] = [];
  for (const group of groups) {
    for (const item of group.items) {
      if (item.enabledWhen === 'hasActiveRemote' && !hasActiveRemote) continue;
      selectable.push(item);
    }
  }
  return selectable;
}

/** Moves the cursor by `dir` (+1 = down, -1 = up), wrapping at boundaries.
 * Returns the new cursor index into the selectable array. */
export function moveCursor(selectable: ActionItem[], cursor: number, dir: 1 | -1): number {
  if (selectable.length === 0) return 0;
  const next = cursor + dir;
  if (next < 0) return selectable.length - 1;
  if (next >= selectable.length) return 0;
  return next;
}

/** Returns the submenu view state when entering a submenu. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function enterSubmenu(parentId: string, restoreCursor: number): ViewState {
  return { view: 'submenu', parentId, restoreCursor } as ViewState;
}

/** Returns the list view state when exiting a submenu. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function exitSubmenu(_view: ViewState): ViewState {
  return { view: 'list' } as ViewState;
}
