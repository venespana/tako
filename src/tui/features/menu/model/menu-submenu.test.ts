// menu-submenu.test.ts — Unit tests for the remotes submenu model.
import { describe, it, expect } from 'vitest';

import { buildRemotesSelectable, getRemotesGroups, getRemotesSelectable } from './menu-submenu.js';
import type { ActionItem } from './menu-items.js';
import { getRegistry } from './menu-registry.js';

const REMOTES_CMDS = ['select', 'add', 'delete'];

describe('buildRemotesSelectable', () => {
  it('maps the submenu commands to routed action items', () => {
    const remotesItem = getRegistry()
      .flatMap(group => group.items)
      .find(item => item.id === 'remotes');

    const selectable = buildRemotesSelectable(remotesItem);

    expect(selectable.map(i => i.label)).toEqual(REMOTES_CMDS);
    expect(selectable.map(i => i.route)).toEqual([
      '/remotes',     // select → /remotes
      '/remotes/add', // add
      '/remotes/rm',  // delete → /remotes/rm
    ]);
    for (const item of selectable) {
      expect(item.kind).toBe('action');
      expect(item.enabledWhen).toBe('always');
      expect(item.handlerKey).toBe(`remotes.${item.label}`);
      expect(item.id).toBe(`remotes-${item.label}`);
    }
  });

  it('returns [] for a missing parent', () => {
    expect(buildRemotesSelectable(undefined)).toEqual([]);
  });

  it('returns [] for a malformed parent (not a submenu / submenu not an array)', () => {
    const action = { id: 'x', label: 'x', command: 'x', kind: 'action' } as ActionItem;
    const badSubmenu = {
      id: 'x',
      label: 'x',
      command: 'x',
      kind: 'submenu',
      submenu: 'nope',
    } as unknown as ActionItem;

    expect(buildRemotesSelectable(action)).toEqual([]);
    expect(buildRemotesSelectable(badSubmenu)).toEqual([]);
  });
});

describe('getRemotesSelectable', () => {
  it('builds the submenu list from the registry', () => {
    expect(getRemotesSelectable().map(i => i.label)).toEqual(REMOTES_CMDS);
  });
});

describe('getRemotesGroups', () => {
  it('renders one synthesized group whose items mirror the selectable list', () => {
    const groups = getRemotesGroups();

    expect(groups).toHaveLength(1);
    expect(groups[0]!.id).toBe('remotes-submenu');
    expect(groups[0]!.label).toBe('remotes');
    expect(groups[0]!.items.map(i => i.id)).toEqual(getRemotesSelectable().map(i => i.id));
  });
});
