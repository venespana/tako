// remotes-menu.ts — The remotes submenu page's menu model: composes the
// menu feature's remotes groups and selectable list into the gated groups +
// selectable pair its ActionMenu consumes (enablement flags come from
// features/menu's withEnablement; the groups are typed by the widget's own
// input contract, widgets/action-menu, ADR-0018 point 6). Pure — no React,
// no router imports; both derive from the frozen registry, so computing them
// once per mount is exact.
import type { ActionItem } from '../../../features/menu/index.js';
import { getRemotesGroups, getRemotesSelectable, withEnablement } from '../../../features/menu/index.js';
import type { RenderableActionGroup } from '../../../widgets/action-menu/index.js';

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
