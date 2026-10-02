// menu-submenu.ts — Remotes submenu model: builds the selectable action list
// and the single renderable group for the '/remotes' menu page from the
// registry's remotes entry. Pure — no React, no router imports.
import type { ActionGroup, ActionItem } from './menu-items.js';
import { getRegistry } from './menu-registry.js';

/** Menu item id of the remotes submenu parent — the only submenu in the registry. */
const REMOTES_ID = 'remotes';

/** The single group a remotes submenu page renders as its screen. */
const REMOTES_SUBMENU_GROUP_ID = 'remotes-submenu';

/** Route for each submenu command. */
function routeFor(cmd: string): string {
  if (cmd === 'select') return '/remotes';
  if (cmd === 'delete') return '/remotes/rm';
  return `/remotes/${cmd}`;
}

/** Build ActionItems for the remotes submenu from the parent's submenu array.
 * Guards against a missing or malformed entry (returns []). */
export function buildRemotesSelectable(remotesItem: ActionItem | undefined): ActionItem[] {
  if (!remotesItem || remotesItem.kind !== 'submenu' || !Array.isArray(remotesItem.submenu)) {
    return [];
  }
  return remotesItem.submenu.map(cmd => ({
    id: `remotes-${cmd}`,
    label: cmd,
    command: cmd,
    kind: 'action' as const,
    enabledWhen: 'always' as const,
    route: routeFor(cmd),
  }));
}

/** Find the remotes submenu parent anywhere in the registry groups. */
function findRemotesItem(groups: ActionGroup[]): ActionItem | undefined {
  for (const group of groups) {
    const found = group.items.find(item => item.id === REMOTES_ID);
    if (found) return found;
  }
  return undefined;
}

/** The remotes submenu as a selectable list of routed action items. */
export function getRemotesSelectable(): ActionItem[] {
  return buildRemotesSelectable(findRemotesItem(getRegistry()));
}

/** The groups the remotes menu page renders: one synthesized group whose
 * items are exactly the selectable list (cursor maps by item id). */
export function getRemotesGroups(): ActionGroup[] {
  return [{ id: REMOTES_SUBMENU_GROUP_ID, label: REMOTES_ID, items: getRemotesSelectable() }];
}
