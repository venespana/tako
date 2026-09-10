// menu-submenu.test.ts — Unit tests for the remotes submenu model.
// NOTE: with the new design, the Remote group has direct action items (Select, Add, Delete)
// instead of a submenu. The submenu functions now return empty since there is no
// submenu parent in the registry — this file tests that dead-code path.
import { describe, it, expect } from 'vitest';

import { buildRemotesSelectable, getRemotesGroups, getRemotesSelectable } from './menu-submenu.js';
import type { ActionItem } from './menu-items.js';

describe('buildRemotesSelectable', () => {
  it('returns [] for a missing parent', () => {
    expect(buildRemotesSelectable(undefined)).toEqual([]);
  });

  it('returns [] for a non-submenu item', () => {
    const action = { id: 'x', label: 'x', command: 'x', kind: 'action' } as ActionItem;
    expect(buildRemotesSelectable(action)).toEqual([]);
  });

  it('returns [] for a malformed submenu (submenu not an array)', () => {
    const badSubmenu = {
      id: 'x',
      label: 'x',
      command: 'x',
      kind: 'submenu',
      submenu: 'nope',
    } as unknown as ActionItem;
    expect(buildRemotesSelectable(badSubmenu)).toEqual([]);
  });
});

describe('getRemotesSelectable', () => {
  it('returns [] since the registry has no submenu parent', () => {
    // The registry now has direct action items (Select, Add, Delete) — no submenu.
    expect(getRemotesSelectable()).toEqual([]);
  });
});

describe('getRemotesGroups', () => {
  it('returns one empty group since selectable is empty', () => {
    const groups = getRemotesGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items).toHaveLength(0);
  });
});
