// menu-flow.ts — Route-aware menu model for the TUI screens.
// Owns the remotes submenu synthesis: given the current route it produces the
// selectable list, the groups a screen should render, and whether arrow-key
// navigation is active. Pure — no React, no side effects.

import type { ActionGroup, ActionItem } from './menu-items.js';
import { getSelectable } from './menu-navigation.js';
import { getRegistry } from './menu-registry.js';

/** Menu item id of the remotes submenu parent — the only submenu in the registry. */
const REMOTES_ID = 'remotes';

/** The single group a remotes submenu route renders as its screen. */
const REMOTES_SUBMENU_GROUP_ID = 'remotes-submenu';

/** Check if a route is a remotes sub-route (remotes, remotes.add, remotes.list, etc.) */
function isRemotesRoute(route: string): boolean {
  return route === REMOTES_ID || route.startsWith(`${REMOTES_ID}.`);
}

/** Routes where arrow-key navigation over a selectable menu is meaningful.
 * On these routes the previous menu is still mounted (behind the screen).
 * On non-navigable routes (doctor, logs, status, cleanup) arrows are ignored
 * and no selectable list is exposed to prevent accidental menu navigation. */
export function isMenuNavigableRoute(route: string): boolean {
  return route === 'home' || isRemotesRoute(route);
}

/** Find the remotes submenu parent anywhere in the registry groups. */
function findRemotesItem(groups: ActionGroup[]): ActionItem | undefined {
  for (const group of groups) {
    const found = group.items.find(item => item.id === REMOTES_ID);
    if (found) return found;
  }
  return undefined;
}

/** Build ActionItems for the remotes submenu from the registry's submenu array.
 * Guards against a missing or malformed submenu entry (returns []). */
function buildRemotesSelectable(remotesItem: ActionItem | undefined): ActionItem[] {
  if (!remotesItem || remotesItem.kind !== 'submenu' || !Array.isArray(remotesItem.submenu)) {
    return [];
  }
  return remotesItem.submenu.map(cmd => ({
    id: `remotes-${cmd}`,
    label: cmd,
    command: cmd,
    kind: 'action' as const,
    enabledWhen: 'always' as const,
    handlerKey: `remotes.${cmd}`,
    route: `remotes.${cmd}`,
  }));
}

/** Menu model for one route: what is selectable, what the screen renders, and
 * whether arrow-key navigation is active on that route. */
export interface MenuFlow {
  selectable: ActionItem[];
  screenGroups: ActionGroup[];
  isNavigable: boolean;
}

/** Compute the menu flow for the current route.
 * - home: full selectable (submenu parents included), registry groups
 * - remotes / remotes.*: synthesized submenu screen
 * - isolated routes (doctor, logs, status, cleanup): empty selectable, no navigation */
export function getSelectableForRoute(route: string, hasActiveRemote: boolean): MenuFlow {
  const groups = getRegistry();

  if (isRemotesRoute(route)) {
    const selectable = buildRemotesSelectable(findRemotesItem(groups));
    return {
      selectable,
      screenGroups: [{ id: REMOTES_SUBMENU_GROUP_ID, label: REMOTES_ID, items: selectable }],
      isNavigable: true,
    };
  }

  if (isMenuNavigableRoute(route)) {
    return { selectable: getSelectable(groups, hasActiveRemote), screenGroups: groups, isNavigable: true };
  }

  return { selectable: [], screenGroups: groups, isNavigable: false };
}
