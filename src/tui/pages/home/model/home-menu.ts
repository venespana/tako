// home-menu.ts — The home page's menu model: composes the menu feature's
// registry and hasActiveRemote gating rule into the groups + selectable
// pair its ActionMenu renders. Pure — no React, no router imports; the
// registry identity is stable (frozen constant), so callers can memoize
// on this function's inputs.
import type { ActionGroup, ActionItem } from '../../../features/menu/index.js';
import { getRegistry, getSelectable } from '../../../features/menu/index.js';

/** The home menu: full registry groups plus the gated selectable list. */
export interface HomeMenu {
  groups: ActionGroup[];
  selectable: ActionItem[];
}

/** Build the home menu, applying the hasActiveRemote gating rule to the
 * registry's selectable list. */
export function getHomeMenu(hasActiveRemote: boolean): HomeMenu {
  const groups = getRegistry();
  return { groups, selectable: getSelectable(groups, hasActiveRemote) };
}
