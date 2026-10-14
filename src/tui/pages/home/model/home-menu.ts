// home-menu.ts — The home page's menu model: composes the menu feature's
// registry and hasActiveRemote gating rule into the gated groups + selectable
// pair its ActionMenu consumes. Enablement is evaluated here (features/menu's
// withEnablement); the groups are typed by the widget's own input contract
// (widgets/action-menu, ADR-0018 point 6) — the page is the composition point
// between both. Pure — no React, no router imports; the registry identity is
// stable (frozen constant), so callers can memoize on this function's inputs.
import type { ActionItem } from '../../../features/menu/index.js';
import { getRegistry, getSelectable, withEnablement } from '../../../features/menu/index.js';
import type { RenderableActionGroup } from '../../../widgets/action-menu/index.js';

/** The home menu: render-ready groups plus the gated selectable list. */
export interface HomeMenu {
  groups: RenderableActionGroup[];
  selectable: ActionItem[];
}

/** Build the home menu, applying the hasActiveRemote gating rule to the
 * registry's selectable list. */
export function getHomeMenu(hasActiveRemote: boolean): HomeMenu {
  const groups = getRegistry();
  const selectable = getSelectable(groups, hasActiveRemote);
  return { groups: withEnablement(groups, selectable), selectable };
}
