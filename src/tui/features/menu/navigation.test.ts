// navigation.test.ts — Unit tests for pure navigation functions.
import { describe, it, expect } from 'vitest';
import type { ActionItem, ActionGroup } from './types.js';
import { getSelectable, moveCursor, enterSubmenu, exitSubmenu } from './navigation.js';

const fakeItem = (id: string, enabledWhen: 'always' | 'hasActiveRemote' = 'always'): ActionItem =>
  ({ id, label: id, command: id, kind: 'action', enabledWhen });

const group = (items: ActionItem[]): ActionGroup => ({ id: 'g1', label: 'Group', items });

// ---------------------------------------------------------------------------
// getSelectable
// ---------------------------------------------------------------------------

describe('getSelectable', () => {
  it('returns only items where enabledWhen === "always" when hasActiveRemote is false', () => {
    const groups: ActionGroup[] = [
      group([fakeItem('a', 'always'), fakeItem('b', 'hasActiveRemote')]),
    ];
    const result = getSelectable(groups, { view: 'list' }, false);
    expect(result.map(i => i.id)).toEqual(['a']);
  });

  it('returns all items when hasActiveRemote is true', () => {
    const groups: ActionGroup[] = [
      group([fakeItem('a', 'always'), fakeItem('b', 'hasActiveRemote')]),
    ];
    const result = getSelectable(groups, { view: 'list' }, true);
    expect(result.map(i => i.id)).toEqual(['a', 'b']);
  });

  it('returns empty array when no items are enabled', () => {
    const groups: ActionGroup[] = [
      group([fakeItem('a', 'hasActiveRemote')]),
    ];
    const result = getSelectable(groups, { view: 'list' }, false);
    expect(result).toEqual([]);
  });

  it('filters to submenu items when in submenu view', () => {
    const item = { id: 'remotes', label: 'remotes', command: 'remotes', kind: 'submenu' as const, submenu: ['add', 'list', 'rm', 'use', 'test'] };
    const groups: ActionGroup[] = [group([item])];
    const result = getSelectable(groups, { view: 'submenu', parentId: 'remotes', restoreCursor: 0 }, false);
    expect(result.map(i => i.id)).toEqual(['remotes']);
  });
});

// ---------------------------------------------------------------------------
// moveCursor
// ---------------------------------------------------------------------------

describe('moveCursor', () => {
  it('increments cursor down', () => {
    const items = [fakeItem('a'), fakeItem('b'), fakeItem('c')];
    expect(moveCursor(items, 0, 1)).toBe(1);
    expect(moveCursor(items, 1, 1)).toBe(2);
  });

  it('decrements cursor up', () => {
    const items = [fakeItem('a'), fakeItem('b'), fakeItem('c')];
    expect(moveCursor(items, 2, -1)).toBe(1);
    expect(moveCursor(items, 1, -1)).toBe(0);
  });

  it('wraps from last to first on down', () => {
    const items = [fakeItem('a'), fakeItem('b'), fakeItem('c')];
    expect(moveCursor(items, 2, 1)).toBe(0);
  });

  it('wraps from first to last on up', () => {
    const items = [fakeItem('a'), fakeItem('b'), fakeItem('c')];
    expect(moveCursor(items, 0, -1)).toBe(2);
  });

  it('returns 0 when items array is empty', () => {
    expect(moveCursor([], 0, 1)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// enterSubmenu
// ---------------------------------------------------------------------------

describe('enterSubmenu', () => {
  it('returns submenu view state with parentId and current cursor', () => {
    const result = enterSubmenu('remotes', 3);
    expect(result).toEqual({ view: 'submenu', parentId: 'remotes', restoreCursor: 3 });
  });
});

// ---------------------------------------------------------------------------
// exitSubmenu
// ---------------------------------------------------------------------------

describe('exitSubmenu', () => {
  it('returns to list view', () => {
    const result = exitSubmenu({ view: 'submenu', parentId: 'remotes', restoreCursor: 3 });
    expect(result).toEqual({ view: 'list' });
  });
});
