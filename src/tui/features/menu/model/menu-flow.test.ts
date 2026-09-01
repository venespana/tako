// menu-flow.test.ts — Unit tests for the matches-driven menu flow.
import { describe, it, expect } from 'vitest';

import { getMenuFlowForMatches } from './menu-flow.js';
import type { RouteMatchLike } from './menu-flow.js';
import { getRegistry } from './menu-registry.js';

const REMOTES_CMDS = ['add', 'list', 'rm', 'use', 'test'];

const homeMatches: RouteMatchLike[] = [{ handle: {} }, { handle: { showLogo: true, menu: 'home' } }];
const remotesMatches: RouteMatchLike[] = [
  { handle: {} },
  { handle: { showLogo: true, menu: 'submenu' } },
  { handle: {} },
];
const isolatedMatches: RouteMatchLike[] = [{ handle: {} }, { handle: { showLogo: false } }];

describe('getMenuFlowForMatches', () => {
  describe('home chain', () => {
    it('exposes the flat selectable list and the registry groups', () => {
      const flow = getMenuFlowForMatches(homeMatches, false);

      expect(flow.isNavigable).toBe(true);
      expect(flow.screenGroups).toEqual(getRegistry());
      // hasActiveRemote=false: doctor + remotes only
      expect(flow.selectable.map(i => i.id)).toEqual(['doctor', 'remotes']);
    });

    it('includes hasActiveRemote-gated items when a remote is active', () => {
      const flow = getMenuFlowForMatches(homeMatches, true);

      expect(flow.selectable.map(i => i.id)).toEqual([
        'doctor',
        'remotes',
        'remote-logs',
        'remote-status',
        'remote-cleanup',
      ]);
    });
  });

  describe('remotes submenu chain', () => {
    it('synthesizes the submenu screen for the remotes layout', () => {
      const flow = getMenuFlowForMatches([{ handle: { menu: 'submenu' } }], false);

      expect(flow.isNavigable).toBe(true);
      expect(flow.selectable.map(i => i.label)).toEqual(REMOTES_CMDS);
      // Every sub-item carries its remotes path for Enter navigation
      expect(flow.selectable.map(i => i.route)).toEqual(REMOTES_CMDS.map(cmd => `/remotes/${cmd}`));
      // The screen renders a single synthesized group
      expect(flow.screenGroups).toHaveLength(1);
      expect(flow.screenGroups[0]!.id).toBe('remotes-submenu');
      expect(flow.screenGroups[0]!.label).toBe('remotes');
      expect(flow.screenGroups[0]!.items).toBe(flow.selectable);
    });

    it('children inherit the submenu list through the layout chain (master-detail)', () => {
      // Inversion of the old isolation rule: on /remotes/* child pages the
      // submenu stays visible and operable, so the flow is the submenu's.
      const flow = getMenuFlowForMatches(remotesMatches, false);

      expect(flow.isNavigable).toBe(true);
      expect(flow.selectable.map(i => i.label)).toEqual(REMOTES_CMDS);
      expect(flow.screenGroups[0]!.id).toBe('remotes-submenu');
    });

    it('takes the deepest menu handle in the chain', () => {
      const flow = getMenuFlowForMatches([{ handle: { menu: 'home' } }, { handle: { menu: 'submenu' } }], false);

      expect(flow.selectable.map(i => i.label)).toEqual(REMOTES_CMDS);
    });
  });

  describe('isolated routes (doctor/logs/status/cleanup)', () => {
    it('exposes no selectable list and disables navigation', () => {
      const flow = getMenuFlowForMatches(isolatedMatches, true);

      expect(flow.isNavigable).toBe(false);
      expect(flow.selectable).toEqual([]);
      expect(flow.screenGroups).toEqual(getRegistry());
    });

    it('isolates routes without any menu handle', () => {
      const flow = getMenuFlowForMatches([], true);

      expect(flow.isNavigable).toBe(false);
      expect(flow.selectable).toEqual([]);
    });
  });
});
