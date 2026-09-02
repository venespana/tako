// remotes-menu.ts — The remotes submenu page's menu model: composes the
// menu feature's remotes groups and selectable list into the pair its
// ActionMenu renders. Pure — no React, no router imports; both derive from
// the frozen registry, so computing them once per mount is exact.
import type { ActionGroup, ActionItem } from '../../../features/menu/index.js';
import { getRemotesGroups, getRemotesSelectable } from '../../../features/menu/index.js';

/** The remotes submenu: one synthesized group plus its selectable list. */
export interface RemotesMenu {
  groups: ActionGroup[];
  selectable: ActionItem[];
}

/** Build the remotes submenu (all five subcommands, always enabled). */
export function getRemotesMenu(): RemotesMenu {
  return { groups: getRemotesGroups(), selectable: getRemotesSelectable() };
}
