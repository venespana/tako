// menu-registry.test.ts — Unit tests for the declarative action registry.
import { describe, it, expect } from 'vitest';

import { getRegistry } from './menu-registry.js';

describe('getRegistry', () => {
  it('returns exactly 3 groups', () => {
    const groups = getRegistry();
    expect(groups).toHaveLength(3);
  });

  it('returns a stable identity across calls (frozen constant)', () => {
    // A fresh array per call would defeat React memo deps in consumers.
    expect(getRegistry()).toBe(getRegistry());
  });

  it('groups are labeled Local, Remote, Config', () => {
    const groups = getRegistry();
    expect(groups.map(g => g.label)).toEqual(['Local', 'Remote', 'Config']);
  });

  it('Local group contains doctor action only', () => {
    const local = getRegistry().find(g => g.id === 'local')!;
    expect(local.items).toHaveLength(1);
    expect(local.items[0]!.id).toBe('doctor');
    expect(local.items[0]!.kind).toBe('action');
    expect(local.items[0]!.enabledWhen).toBe('always');
  });

  it('Remote group contains Select, Add, Delete and Status', () => {
    const remote = getRegistry().find(g => g.id === 'remote')!;
    expect(remote.items.map(i => i.id)).toEqual(['remote-select', 'remote-add', 'remote-delete', 'status']);
    // Select/Add/Delete stay unconditionally selectable (9.14d: the remote's
    // workspace is its menu); Status is the one gated entry — it needs an
    // active remote to query.
    const gated = remote.items.filter(i => i.id !== 'status');
    expect(gated.every(i => i.kind === 'action')).toBe(true);
    expect(gated.every(i => i.enabledWhen === 'always')).toBe(true);
    expect(remote.items.find(i => i.id === 'status')).toMatchObject({
      kind: 'submenu',
      enabledWhen: 'hasActiveRemote',
      route: '/status',
    });
  });

  it('Remote items route correctly', () => {
    const remote = getRegistry().find(g => g.id === 'remote')!;
    const select = remote.items.find(i => i.id === 'remote-select')!;
    const add = remote.items.find(i => i.id === 'remote-add')!;
    const deleteItem = remote.items.find(i => i.id === 'remote-delete')!;
    expect(select.route).toBe('/remotes');
    expect(add.route).toBe('/remotes/add');
    expect(deleteItem.route).toBe('/remotes/rm');
  });

  it('no registry item routes to /tasks — the workspace is reached via Select (9.14d)', () => {
    const allItems = getRegistry().flatMap(g => g.items);
    expect(allItems.filter(i => i.route === '/tasks')).toEqual([]);
  });

  it('no hidden unimplemented commands appear', () => {
    const allItems = getRegistry().flatMap(g => g.items);
    const ids = allItems.map(i => i.id);
    // 'status' is implemented since mvp-status-command — its home entry is
    // gated by hasActiveRemote, not hidden.
    const hidden = ['install', 'update', 'logs', 'cleanup', 'rollback', 'list', 'use', 'test', 'tasks'];
    hidden.forEach(id => {
      expect(ids).not.toContain(id);
    });
  });
});
