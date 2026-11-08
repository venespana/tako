// use-global-keys.ts — Shared-layer hook owning the TUI's global keyboard
// model: quit (q / Ctrl-C) and linear back (h/Esc/⌫). Menu cursors and
// selection live in the menu pages via useMenuList; nothing here knows about
// menus. Consumed by AppShell; router state comes from the react-router data
// router hooks. Key interpretation is delegated to useKeyBindings (9.9).
//
// Precedence (iteration 3 correction): a page's PANE LOCK
// (pane-lock-store) beats the back keys — while locked, Esc/h/⌫ are
// suppressed because the locked pane owns them for its unlock (unlocking
// must never also navigate away); quit (q / Ctrl-C) always wins. When
// `isActive` is false (e.g. during text input), this hook is a no-op so
// that h/j/k/l characters reach the text input without being intercepted.
import { useApp } from 'ink';

import { useLocation, useNavigate } from 'react-router';

import { useEditingStore } from './editing-store.js';
import { usePaneLockStore } from './pane-lock-store.js';
import { useKeyBindings } from './use-key-bindings.js';

export function useGlobalKeys(isActive: boolean = true): void {
  const { exit } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const isEditing = useEditingStore(state => state.isEditing);
  const paneLocked = usePaneLockStore(state => state.locked);

  const active = isActive && !isEditing;

  // Back — page flow is strictly linear (menus are pages, no master-detail
  // shortcuts), so history order == visit order and navigate(-1) IS the
  // previous page. At home or on the initial history entry there is nothing
  // to pop (navigate(-1) would be a no-op), so exit instead. Suppressed
  // while a pane lock holds: Esc/h/⌫ belong to the locked pane's unlock.
  const goBack = (): void => {
    if (paneLocked) return;

    if (location.pathname === '/' || location.key === 'default') exit();
    else navigate(-1);
  };
  const quit = (): void => {
    exit();
  };

  useKeyBindings(
    {
      // Quit on q or Ctrl-C (only Ctrl-C — other ctrl combos must not exit)
      chars: { q: quit, h: goBack },
      ctrlC: quit,
      cancel: goBack,
      backspace: goBack,
    },
    { isActive: active }
  );
}
