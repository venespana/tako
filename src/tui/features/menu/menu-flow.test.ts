// menu-flow.test.ts — Unit tests for the route-aware menu flow.
import { describe, it, expect } from 'vitest';
import { getSelectableForRoute, isMenuNavigableRoute } from './menu-flow.js';
import { getRegistry } from './registry.js';

const REMOTES_CMDS = ['add', 'list', 'rm', 'use', 'test'];

describe('getSelectableForRoute', () => {
  describe('home route', () => {
    it('exposes the flat selectable list and the registry groups', () => {
      const flow = getSelectableForRoute('home', false);

      expect(flow.isNavigable).toBe(true);
      expect(flow.screenGroups).toEqual(getRegistry());
      // hasActiveRemote=false: doctor + remotes only
      expect(flow.selectable.map(i => i.id)).toEqual(['doctor', 'remotes']);
    });

    it('includes hasActiveRemote-gated items when a remote is active', () => {
      const flow = getSelectableForRoute('home', true);

      expect(flow.selectable.map(i => i.id)).toEqual([
        'doctor',
        'remotes',
        'remote-logs',
        'remote-status',
        'remote-cleanup',
      ]);
    });
  });

  describe('remotes submenu routes', () => {
    it('synthesizes the submenu screen on the remotes root', () => {
      const flow = getSelectableForRoute('remotes', false);

      expect(flow.isNavigable).toBe(true);
      expect(flow.selectable.map(i => i.label)).toEqual(REMOTES_CMDS);
      // Every sub-item carries its remotes.* route for Enter navigation
      expect(flow.selectable.map(i => i.route)).toEqual(REMOTES_CMDS.map(cmd => `remotes.${cmd}`));
      // The screen renders a single synthesized group
      expect(flow.screenGroups).toHaveLength(1);
      expect(flow.screenGroups[0]!.id).toBe('remotes-submenu');
      expect(flow.screenGroups[0]!.label).toBe('remotes');
      expect(flow.screenGroups[0]!.items).toBe(flow.selectable);
    });

    it('uses the same submenu model on child routes (remotes.list)', () => {
      const flow = getSelectableForRoute('remotes.list', false);

      expect(flow.isNavigable).toBe(true);
      expect(flow.selectable.map(i => i.label)).toEqual(REMOTES_CMDS);
    });
  });

  describe('isolated routes (doctor/logs/status/cleanup)', () => {
    it('exposes no selectable list and disables navigation', () => {
      for (const route of ['doctor', 'logs', 'status', 'cleanup']) {
        const flow = getSelectableForRoute(route, true);
        expect(flow.isNavigable).toBe(false);
        expect(flow.selectable).toEqual([]);
        expect(flow.screenGroups).toEqual(getRegistry());
      }
    });
  });
});

describe('isMenuNavigableRoute', () => {
  it('is true on home and remotes.* routes', () => {
    expect(isMenuNavigableRoute('home')).toBe(true);
    expect(isMenuNavigableRoute('remotes')).toBe(true);
    expect(isMenuNavigableRoute('remotes.add')).toBe(true);
  });

  it('is false on isolated routes', () => {
    expect(isMenuNavigableRoute('doctor')).toBe(false);
    expect(isMenuNavigableRoute('logs')).toBe(false);
    expect(isMenuNavigableRoute('status')).toBe(false);
    expect(isMenuNavigableRoute('cleanup')).toBe(false);
    expect(isMenuNavigableRoute('remotes.nope')).toBe(true); // still a remotes submenu route
  });
});
