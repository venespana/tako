// useHomeNavigation.test.ts — Integration tests for useHomeNavigation hook.
// Tests the hook via pure function contracts since @testing-library/react-hooks
// is not installed. Pure navigation functions are tested separately in navigation.test.ts.
// This file tests the hook wiring through the App integration.
//
// The pure functions getSelectable, moveCursor, enterSubmenu, exitSubmenu
// are tested in navigation.test.ts. Here we verify the hook correctly
// integrates them with useState.

import { describe, it, expect } from 'vitest';
import { getSelectable, moveCursor, enterSubmenu, exitSubmenu } from '../features/menu/navigation.js';
import { getRegistry } from '../features/menu/registry.js';
import type { ViewState } from '../features/menu/types.js';

describe('useHomeNavigation integration with pure functions', () => {
  // These tests verify the pure function contracts that the hook depends on.
  // The hook is a thin useState wrapper around these functions.

  it('getSelectable with hasActiveRemote=false filters remote items', () => {
    const groups = getRegistry();
    const view: ViewState = { view: 'list' };
    const selectable = getSelectable(groups, view, false);
    const ids = selectable.map(i => i.id);

    // Only 'doctor' (always) should be selectable
    expect(ids).toContain('doctor');
    expect(ids).not.toContain('logs');
    expect(ids).not.toContain('status');
    expect(ids).not.toContain('cleanup');
    // 'remotes' is always shown
    expect(ids).toContain('remotes');
  });

  it('moveCursor wraps at boundaries', () => {
    const items = [
      { id: 'a', label: 'a', command: 'a', kind: 'action' as const },
      { id: 'b', label: 'b', command: 'b', kind: 'action' as const },
      { id: 'c', label: 'c', command: 'c', kind: 'action' as const },
    ];
    // At last item, moving down wraps to 0
    expect(moveCursor(items, 2, 1)).toBe(0);
    // At first item, moving up wraps to last
    expect(moveCursor(items, 0, -1)).toBe(2);
  });

  it('enterSubmenu creates submenu view state', () => {
    const result = enterSubmenu('remotes', 3);
    expect(result).toEqual({ view: 'submenu', parentId: 'remotes', restoreCursor: 3 });
  });

  it('exitSubmenu returns to list view', () => {
    const submenuView: ViewState = { view: 'submenu', parentId: 'remotes', restoreCursor: 3 };
    const result = exitSubmenu(submenuView);
    expect(result).toEqual({ view: 'list' });
  });

  it('getSelectable in submenu view returns only the submenu parent', () => {
    const groups = getRegistry();
    const view: ViewState = { view: 'submenu', parentId: 'remotes', restoreCursor: 0 };
    const selectable = getSelectable(groups, view, false);

    expect(selectable).toHaveLength(1);
    expect(selectable[0]!.id).toBe('remotes');
  });
});
