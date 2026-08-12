// App.tsx — Root TUI component: discriminated-union state machine + useInput.
// Renders HomePage and dispatches to domain use cases via injected ports.
import { useState } from 'react';

import { useInput, useApp } from 'ink';
import type { Key } from 'ink';

import { getSelectable, moveCursor, enterSubmenu, exitSubmenu } from '../features/menu/navigation.js';
import { getRegistry } from '../features/menu/registry.js';
import type { DispatchMap, ViewState } from '../features/menu/types.js';
import { HomePage } from '../pages/HomePage.js';

export interface AppProps {
  /** Map of actionId → async handler. In production, wired to domain use cases. */
  dispatch?: DispatchMap;
  /** Whether a remote is currently configured. */
  hasActiveRemote?: boolean;
}

export default function App({ dispatch = {}, hasActiveRemote = false }: AppProps): React.ReactElement {
  const groups = getRegistry();
  const [view, setView] = useState<ViewState>({ view: 'list' });
  const [cursor, setCursor] = useState(0);
  const { exit } = useApp();

  const selectable = getSelectable(groups, view, hasActiveRemote);

  // handleKey doesn't need memoization since useInput re-registers on each render
  const handleKey = async (input: string, key: Key) => {
    // Quit on q or Ctrl-C
    if (input === 'q' || key.ctrl) {
      exit();
      return;
    }

    // Navigation
    if (key.upArrow || input === 'k') {
      setCursor(prev => moveCursor(selectable, prev, -1));
      return;
    }
    if (key.downArrow || input === 'j') {
      setCursor(prev => moveCursor(selectable, prev, 1));
      return;
    }

    // Select / Enter
    if (key.return || input === 'l') {
      const focused = selectable[cursor];
      if (!focused) return;

      if (view.view === 'submenu') {
        // In submenu, Enter on the parent remotes item does nothing (subactions are display-only in MVP)
        return;
      }

      if (focused.kind === 'action' && focused.handlerKey) {
        const handler = dispatch[focused.handlerKey];
        if (handler) {
          await handler();
        }
        return;
      }

      if (focused.kind === 'submenu') {
        // Enter on remotes → enter submenu
        setView(enterSubmenu(focused.id, cursor));
        setCursor(0);
        return;
      }
      return;
    }

    // Back
    if (key.escape || key.backspace || input === 'h') {
      if (view.view === 'submenu') {
        const nextView = exitSubmenu(view);
        setView(nextView);
        // Restore cursor position stored in the submenu view
        if (nextView.view === 'list') {
          // restoreCursor is in the old view
          setCursor((view as { restoreCursor: number }).restoreCursor);
        }
        return;
      }
      return;
    }
  };

  useInput(handleKey);

  return <HomePage groups={groups} selectable={selectable} cursor={cursor} view={view} />;
}
