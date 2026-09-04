// menu-navigation.test.ts — Unit tests for pure menu-state functions.
import { describe, it, expect } from 'vitest';
import type { ActionItem, ActionGroup } from './menu-items.js';
import { getSelectable, moveCursor, withEnablement } from './menu-navigation.js';

const fakeItem = (id: string, enabledWhen: 'always' | 'hasActiveRemote' = 'always'): ActionItem => ({
  id,
  label: id,
  command: id,
  kind: 'action',
  enabledWhen,
});

const group = (items: ActionItem[]): ActionGroup => ({ id: 'g1', label: 'Group', items });

// ---------------------------------------------------------------------------
// getSelectable
// ---------------------------------------------------------------------------

describe('getSelectable', () => {
  it('returns only items where enabledWhen === "always" when hasActiveRemote is false', () => {
    const groups: ActionGroup[] = [group([fakeItem('a', 'always'), fakeItem('b', 'hasActiveRemote')])];
    const result = getSelectable(groups, false);
    expect(result.map(i => i.id)).toEqual(['a']);
  });

  it('returns all items when hasActiveRemote is true', () => {
    const groups: ActionGroup[] = [group([fakeItem('a', 'always'), fakeItem('b', 'hasActiveRemote')])];
    const result = getSelectable(groups, true);
    expect(result.map(i => i.id)).toEqual(['a', 'b']);
  });

  it('returns empty array when no items are enabled', () => {
    const groups: ActionGroup[] = [group([fakeItem('a', 'hasActiveRemote')])];
    const result = getSelectable(groups, false);
    expect(result).toEqual([]);
  });

  it('includes submenu items in the flat selectable list', () => {
    // Submenu parents are selectable: Enter on them navigates to their route.
    const action = fakeItem('a', 'always');
    const submenu = {
      id: 'remotes',
      label: 'remotes',
      command: 'remotes',
      kind: 'submenu' as const,
      submenu: ['add', 'list', 'rm', 'use', 'test'],
    };
    const groups: ActionGroup[] = [group([action, submenu])];

    expect(getSelectable(groups, false).map(i => i.id)).toEqual(['a', 'remotes']);
  });
});

// ---------------------------------------------------------------------------
// withEnablement
// ---------------------------------------------------------------------------

describe('withEnablement', () => {
  it('marks items in the selectable list as enabled and the rest as disabled', () => {
    const always = fakeItem('a', 'always');
    const gated = fakeItem('b', 'hasActiveRemote');
    const groups: ActionGroup[] = [group([always, gated])];

    const renderable = withEnablement(groups, getSelectable(groups, false));

    expect(renderable[0]!.items.map(i => [i.id, i.enabled])).toEqual([
      ['a', true],
      ['b', false],
    ]);
  });

  it('marks gated items enabled when the gate passes', () => {
    const gated = fakeItem('b', 'hasActiveRemote');
    const groups: ActionGroup[] = [group([gated])];

    const renderable = withEnablement(groups, getSelectable(groups, true));

    expect(renderable[0]!.items[0]!.enabled).toBe(true);
  });

  it('preserves group structure and item fields', () => {
    const item = fakeItem('a', 'always');
    const groups: ActionGroup[] = [group([item]), { id: 'g2', label: 'Empty', items: [] }];

    const renderable = withEnablement(groups, [item]);

    expect(renderable.map(g => [g.id, g.label])).toEqual([
      ['g1', 'Group'],
      ['g2', 'Empty'],
    ]);
    const { enabled, ...rest } = renderable[0]!.items[0]!;
    expect(enabled).toBe(true);
    expect(rest).toEqual(item);
  });

  it('returns fresh objects and does not mutate the input groups', () => {
    const item = fakeItem('a', 'always');
    const groups: ActionGroup[] = [group([item])];
    const before = JSON.stringify(groups);

    const renderable = withEnablement(groups, []);

    expect(renderable[0]!.items[0]!.enabled).toBe(false);
    expect(JSON.stringify(groups)).toBe(before);
    expect('enabled' in groups[0]!.items[0]!).toBe(false);
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
