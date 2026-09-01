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

  it('Remote group contains remotes submenu plus disabled action items', () => {
    const remote = getRegistry().find(g => g.id === 'remote')!;
    const remotesItem = remote.items.find(i => i.id === 'remotes');
    expect(remotesItem).toBeDefined();
    expect(remotesItem!.kind).toBe('submenu');
    expect(remotesItem!.submenu).toEqual(['add', 'list', 'rm', 'use', 'test']);

    // Other remote items should be disabled when no active remote
    const disabledItems = remote.items.filter(i => i.enabledWhen === 'hasActiveRemote');
    expect(disabledItems.length).toBeGreaterThan(0);
  });

  it('doctor action has handlerKey', () => {
    const local = getRegistry().find(g => g.id === 'local')!;
    expect(local.items[0]!.handlerKey).toBe('doctor');
  });

  it('remotes submenu has handlerKey', () => {
    const remote = getRegistry().find(g => g.id === 'remote')!;
    const remotesItem = remote.items.find(i => i.id === 'remotes')!;
    expect(remotesItem.handlerKey).toBe('remotes');
  });

  it('no hidden unimplemented commands appear', () => {
    const allItems = getRegistry().flatMap(g => g.items);
    const ids = allItems.map(i => i.id);
    const hidden = ['install', 'update', 'status', 'logs', 'cleanup', 'rollback'];
    hidden.forEach(id => {
      expect(ids).not.toContain(id);
    });
  });
});
