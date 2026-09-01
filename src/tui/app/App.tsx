// App.tsx — Root TUI component: router-driven screen renderer + useInput.
// No more useState<ViewState>; route state lives in the Zustand router store.
import { useEffect, useState, useMemo } from 'react';

import { useInput, useApp, Box } from 'ink';
import type { Key } from 'ink';

import { getSelectable, moveCursor } from '../features/menu/navigation.js';
import { getRegistry } from '../features/menu/registry.js';
import type { ActionItem, DispatchMap } from '../features/menu/types.js';
import type { RouteName } from './router/types.js';
import { useRouterStore, setExitHandler, ROUTE_REGISTRY } from './router/index.js';
import { Logo } from '../widgets/Logo.js';

export interface AppProps {
  /** Map of actionId → async handler. In production, wired to domain use cases. */
  dispatch?: DispatchMap;
  /** Whether a remote is currently configured. */
  hasActiveRemote?: boolean;
}

/** Build ActionItems for the remotes submenu from the registry's submenu array. */
function buildRemotesSelectable(remotesItem: ActionItem): ActionItem[] {
  if (remotesItem.kind !== 'submenu' || !Array.isArray(remotesItem.submenu)) {
    return [];
  }
  return remotesItem.submenu.map(cmd => ({
    id: `remotes-${cmd}`,
    label: cmd,
    command: cmd,
    kind: 'action' as const,
    enabledWhen: 'always' as const,
    handlerKey: `remotes.${cmd}`,
    route: (`remotes.${cmd}`) as RouteName,
  }));
}

/** Check if a route is a remotes sub-route (remotes, remotes.add, remotes.list, etc.) */
function isRemotesRoute(route: string): boolean {
  return route === 'remotes' || route.startsWith('remotes.');
}

/** Routes where arrow-key navigation over a selectable menu is meaningful.
 * On these routes the previous menu is still mounted (behind the screen).
 * On non-navigable routes (doctor, logs, status, cleanup) arrows are ignored
 * and no selectable list is exposed to prevent accidental menu navigation. */
function isMenuNavigableRoute(route: string): boolean {
  return route === 'home' || isRemotesRoute(route);
}

export default function App({ dispatch = {}, hasActiveRemote = false }: AppProps): React.ReactElement {
  const groups = getRegistry();
  const { exit } = useApp();

  // Router state
  const currentRoute = useRouterStore(s => s.currentRoute);
  const navigate = useRouterStore(s => s.navigate);
  const goBack = useRouterStore(s => s.goBack);

  // Home cursor is local UI state (not router state)
  const [cursor, setCursor] = useState<number>(0);

  // Compute selectable based on current route
  const { selectable, isSubmenuRoute, isNavigable } = useMemo(() => {
    // Remotes submenu routes: build selectable from the 5 remotes sub-items
    if (isRemotesRoute(currentRoute)) {
      let remotesItem: ActionItem | undefined;
      for (const group of groups) {
        remotesItem = group.items.find(item => item.id === 'remotes');
        if (remotesItem) break;
      }
      const remotesSelectable = buildRemotesSelectable(remotesItem!);
      return { selectable: remotesSelectable, isSubmenuRoute: true, isNavigable: true };
    }
    // Home: full selectable with submenu items included
    if (currentRoute === 'home') {
      const normalSelectable = getSelectable(groups, { view: 'list' }, hasActiveRemote);
      return { selectable: normalSelectable, isSubmenuRoute: false, isNavigable: true };
    }
    // Isolated routes (doctor, logs, status, cleanup): no menu navigation, empty selectable
    return { selectable: [] as ActionItem[], isSubmenuRoute: false, isNavigable: false };
  }, [currentRoute, groups, hasActiveRemote]);

  // Reset cursor to 0 whenever the route changes
  useEffect(() => {
    setCursor(0);
  }, [currentRoute]);

  // Wire Ink exit to router's setExitHandler once.
  // Terminal cleanup is handled by Ink's alternateScreen at the composition root —
  // never write raw escape sequences here: they corrupt Ink's frame sync.
  useEffect(() => {
    setExitHandler(exit);
  }, [exit]);

  // handleKey doesn't need memoization since useInput re-registers on each render
  const handleKey = async (input: string, key: Key) => {
    // Quit on q or Ctrl-C
    if (input === 'q' || key.ctrl) {
      exit();
      return;
    }

    // Navigation (cursor movement only works on menu-navigable routes)
    if (isNavigable) {
      if (key.upArrow || input === 'k') {
        setCursor(prev => moveCursor(selectable, prev, -1));
        return;
      }
      if (key.downArrow || input === 'j') {
        setCursor(prev => moveCursor(selectable, prev, 1));
        return;
      }
    }

    // Back — always active, returns to previous route or exits on home
    if (key.escape || key.backspace || input === 'h') {
      goBack();
      return;
    }

    // Select / Enter — only meaningful on navigable routes with a valid focused item
    if (key.return || input === 'l') {
      if (!isNavigable) return;
      const focused = selectable[cursor];
      if (!focused) return;

      // Submenu item on home — navigate to the submenu
      if (focused.kind === 'submenu' && focused.route) {
        navigate(focused.route);
        return;
      }

      // Action item with a route (e.g. remotes sub-items) — navigate to the route
      if (focused.kind === 'action' && focused.route) {
        navigate(focused.route);
        return;
      }

      // Action item — dispatch handler
      if (focused.kind === 'action' && focused.handlerKey) {
        const handler = dispatch[focused.handlerKey];
        if (handler) {
          await handler();
        }
        return;
      }
    }
  };

  useInput(handleKey);

  const entry = ROUTE_REGISTRY[currentRoute];
  const Screen = entry?.Screen ?? (() => <span>Not found</span>);

  // Determine which groups and selectable to pass to the Screen
  // For remotes submenu routes, pass the remotes sub-items as a single group
  const screenGroups = isSubmenuRoute
    ? [{
        id: 'remotes-submenu',
        label: 'remotes',
        items: selectable,
      }]
    : groups;

  return (
    // Root owns the vertical budget: exactly one viewport tall.
    // Logo takes its natural height; the Screen fills the remainder via flexGrow.
    // This keeps logo + screen == terminal height (no overflow, no clipped logo).
    <Box flexDirection='column' height={process.stdout.rows ?? 40}>
      {entry?.showLogo && <Logo />}
      <Screen groups={screenGroups} selectable={selectable} cursor={cursor} />
    </Box>
  );
}
