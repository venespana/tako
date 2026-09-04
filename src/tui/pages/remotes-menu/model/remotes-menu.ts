// remotes-menu.ts — The remotes submenu page's menu model: composes the
// menu feature's remotes groups and selectable list into the render-ready
// pair its ActionMenu consumes (enablement flags come from features/menu's
// withEnablement). Pure — no React, no router imports; both derive from
// the frozen registry, so computing them once per mount is exact.
import type { ActionItem, RenderableActionGroup } from '../../../features/menu/index.js';
import { getRemotesGroups, getRemotesSelectable, withEnablement } from '../../../features/menu/index.js';

/** The remotes submenu: one synthesized group plus its selectable list. */
export interface RemotesMenu {
  groups: RenderableActionGroup[];
  selectable: ActionItem[];
}

/** Build the remotes submenu (all five subcommands, always enabled). */
export function getRemotesMenu(): RemotesMenu {
  const selectable = getRemotesSelectable();
  return { groups: withEnablement(getRemotesGroups(), selectable), selectable };
}
