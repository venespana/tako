// menu-flow.ts — Menu model derived from the react-router match chain.
// Given the matched route chain it produces the selectable list, the groups
// the active screen renders, and whether arrow-key navigation is active.
// Pure — no React, no router imports, no side effects (matches enter as a
// structural { handle } shape, so unit tests pass plain objects).

import type { ActionGroup, ActionItem } from './menu-items.js';
import { getSelectable } from './menu-navigation.js';
import { getRegistry } from './menu-registry.js';
import type { RouteHandle } from '../../../shared/lib/route-tree.js';

/** Structural subset of a react-router match that menu derivation needs. */
export interface RouteMatchLike {
  handle?: unknown;
}

/** Menu item id of the remotes submenu parent — the only submenu in the registry. */
const REMOTES_ID = 'remotes';

/** The single group a remotes submenu route renders as its screen. */
const REMOTES_SUBMENU_GROUP_ID = 'remotes-submenu';

/** Menu model for one route chain: what is selectable, what the active
 * screen renders, and whether arrow-key navigation is active. */
export interface MenuFlow {
  selectable: ActionItem[];
  screenGroups: ActionGroup[];
  isNavigable: boolean;
}

/** Deepest match whose handle declares a menu. Children of the remotes
 * layout inherit its 'submenu' through the match chain; isolated stub
 * routes (doctor, logs, status, cleanup) find none. */
function activeMenuKind(matches: readonly RouteMatchLike[]): RouteHandle['menu'] {
  for (let i = matches.length - 1; i >= 0; i--) {
    const meta = matches[i]?.handle as RouteHandle | undefined;
    if (meta?.menu !== undefined) return meta.menu;
  }
  return undefined;
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
    route: `/remotes/${cmd}`,
  }));
}

/** Compute the menu flow for the matched route chain.
 * - home: full selectable (submenu parents included), registry groups
 * - remotes and remotes/* (submenu layout chain): synthesized submenu list —
 *   the layout keeps it visible (master-detail) while a child renders
 * - everything else (doctor, logs, status, cleanup): isolated — empty
 *   selectable, no navigation */
export function getMenuFlowForMatches(matches: readonly RouteMatchLike[], hasActiveRemote: boolean): MenuFlow {
  const groups = getRegistry();
  const menuKind = activeMenuKind(matches);

  if (menuKind === 'submenu') {
    const selectable = buildRemotesSelectable(findRemotesItem(groups));
    return {
      selectable,
      screenGroups: [{ id: REMOTES_SUBMENU_GROUP_ID, label: REMOTES_ID, items: selectable }],
      isNavigable: true,
    };
  }

  if (menuKind === 'home') {
    return { selectable: getSelectable(groups, hasActiveRemote), screenGroups: groups, isNavigable: true };
  }

  return { selectable: [], screenGroups: groups, isNavigable: false };
}
