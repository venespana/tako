// use-menu-navigation.ts — Select-to-navigate wiring for menu pages:
// returns the handleSelect handler the pages previously duplicated
// (undefined-route guard + same-path dedupe + navigate). Uses the router
// directly, so this hook is only consumed inside a router context.
import { useLocation, useNavigate } from 'react-router';

import type { ActionItem } from './menu-items.js';

export function useMenuNavigation(): (item: ActionItem) => void {
  const navigate = useNavigate();
  const location = useLocation();

  // Select = navigate to the item's route (registry items only ever carry
  // valid route paths; the same path is deduped as a no-op). A fresh closure
  // per render keeps the dedupe check on the latest location, matching the
  // inline handlers this hook replaced.
  return (item: ActionItem): void => {
    if (item.route === undefined) return;
    if (location.pathname === item.route) return;
    navigate(item.route);
  };
}
