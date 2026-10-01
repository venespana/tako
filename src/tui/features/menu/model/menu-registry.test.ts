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

  it('Remote group contains Select, Add and Delete only — no home Tasks entry (9.14d)', () => {
    const remote = getRegistry().find(g => g.id === 'remote')!;
    expect(remote.items.map(i => i.id)).toEqual(['remote-select', 'remote-add', 'remote-delete']);
    expect(remote.items.every(i => i.kind === 'action')).toBe(true);
    // The tasks workspace is the REMOTE's menu (9.14d): every home remote
    // entry is unconditionally selectable.
    expect(remote.items.every(i => i.enabledWhen === 'always')).toBe(true);
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

  it('doctor action has handlerKey', () => {
    const local = getRegistry().find(g => g.id === 'local')!;
    expect(local.items[0]!.handlerKey).toBe('doctor');
  });

  it('no hidden unimplemented commands appear', () => {
    const allItems = getRegistry().flatMap(g => g.items);
    const ids = allItems.map(i => i.id);
    const hidden = ['install', 'update', 'status', 'logs', 'cleanup', 'rollback', 'list', 'use', 'test', 'tasks'];
    hidden.forEach(id => {
      expect(ids).not.toContain(id);
    });
  });
});
