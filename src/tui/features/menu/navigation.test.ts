// navigation.test.ts — Unit tests for pure navigation functions.
import { describe, it, expect } from 'vitest';
import type { ActionItem, ActionGroup } from './types.js';
import { getSelectable, moveCursor } from './navigation.js';

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
    const result = getSelectable(groups, false);
    expect(result.map(i => i.id)).toEqual(['a']);
  });

  it('returns all items when hasActiveRemote is true', () => {
    const groups: ActionGroup[] = [
      group([fakeItem('a', 'always'), fakeItem('b', 'hasActiveRemote')]),
    ];
    const result = getSelectable(groups, true);
    expect(result.map(i => i.id)).toEqual(['a', 'b']);
  });

  it('returns empty array when no items are enabled', () => {
    const groups: ActionGroup[] = [
      group([fakeItem('a', 'hasActiveRemote')]),
    ];
    const result = getSelectable(groups, false);
    expect(result).toEqual([]);
  });

  it('includes submenu items in the flat selectable list', () => {
    // Submenu parents are selectable: Enter on them navigates to their route.
    const action = fakeItem('a', 'always');
    const submenu = { id: 'remotes', label: 'remotes', command: 'remotes', kind: 'submenu' as const, submenu: ['add', 'list', 'rm', 'use', 'test'] };
    const groups: ActionGroup[] = [group([action, submenu])];

    expect(getSelectable(groups, false).map(i => i.id)).toEqual(['a', 'remotes']);
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
