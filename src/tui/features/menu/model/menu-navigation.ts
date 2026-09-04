// menu-navigation.ts — Pure menu-state functions for the menu feature:
// enablement gating (getSelectable / withEnablement) and cursor movement.
// These are pure (no side effects, no React hooks) making them trivial to unit-test.

import type { ActionGroup, ActionItem, RenderableActionGroup } from './menu-items.js';

/** Returns the selectable ActionItems for the menu.
 * Submenu parent items (kind === 'submenu') ARE included in the flat selectable list
 * because selecting them triggers router navigation to the submenu root.
 * Disabled items (enabledWhen: 'hasActiveRemote' with hasActiveRemote=false) are excluded. */
export function getSelectable(groups: ActionGroup[], hasActiveRemote: boolean): ActionItem[] {
  const selectable: ActionItem[] = [];
  for (const group of groups) {
    for (const item of group.items) {
      if (item.enabledWhen === 'hasActiveRemote' && !hasActiveRemote) continue;
      selectable.push(item);
    }
  }
  return selectable;
}

/** Map groups + their gated selectable list to render-ready groups where each
 * item carries `enabled`. This is the single place the enablement rule is
 * evaluated for rendering — widgets receive the flag and stay free of menu
 * semantics. Pure: returns fresh objects (the registry stays frozen). */
export function withEnablement(groups: ActionGroup[], selectable: ActionItem[]): RenderableActionGroup[] {
  const selectableIds = new Set(selectable.map(item => item.id));
  return groups.map(group => ({
    id: group.id,
    label: group.label,
    items: group.items.map(item => ({ ...item, enabled: selectableIds.has(item.id) })),
  }));
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
