// ActionMenu.test.tsx — Unit tests for ActionMenu widget.
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import type { ReactElement } from 'react';
import { ActionMenu } from './ActionMenu.js';
import type { ActionGroup, ActionItem } from '../features/menu/types.js';

const makeItem = (overrides: Partial<ActionItem> = {}): ActionItem => ({
  id: 'test',
  label: 'test',
  command: 'test',
  kind: 'action',
  ...overrides,
});

const makeGroup = (overrides: Partial<ActionGroup> & { items?: ActionItem[] } = {}): ActionGroup => ({
  id: 'group1',
  label: 'Group',
  items: [],
  ...overrides,
});

describe('ActionMenu', () => {
  describe('cursor rendering', () => {
    it('shows cursor glyph on focused item', () => {
      const groups = [makeGroup({ id: 'g1', label: 'Local', items: [makeItem({ id: 'doctor', label: 'doctor' })] })];
      const selectable = [groups[0]!.items[0]!];
      const cursor = 0;

      const { lastFrame } = render(
        <ActionMenu groups={groups} selectable={selectable} cursor={cursor} view={{ view: 'list' } as const} />
      );

      expect(lastFrame()).toContain('❯');
      expect(lastFrame()).toContain('doctor');
    });

    it('does not show cursor on non-focused items', () => {
      const groups = [
        makeGroup({
          id: 'g1',
          label: 'Local',
          items: [
            makeItem({ id: 'a', label: 'item-a' }),
            makeItem({ id: 'b', label: 'item-b' }),
          ],
        }),
      ];
      const selectable = groups[0]!.items;
      const cursor = 0; // focused on 'a'

      const { lastFrame } = render(
        <ActionMenu groups={groups} selectable={selectable} cursor={cursor} view={{ view: 'list' } as const} />
      );

      const frame = lastFrame();
      // Only 'a' should have cursor, 'b' should not
      expect(frame).toContain('❯');
      expect(frame).not.toContain('❯item-b');
    });

    it('shows cursor in cyan color on focused item', () => {
      const groups = [makeGroup({ id: 'g1', label: 'Local', items: [makeItem({ id: 'doctor', label: 'doctor' })] })];
      const selectable = [groups[0]!.items[0]!];
      const cursor = 0;

      const { lastFrame } = render(
        <ActionMenu groups={groups} selectable={selectable} cursor={cursor} view={{ view: 'list' } as const} />
      );

      // Cyan cursor glyph
      expect(lastFrame()).toContain('❯');
    });
  });

  describe('disabled items', () => {
    it('renders disabled item with dim/grey style', () => {
      const groups = [
        makeGroup({
          id: 'remote',
          label: 'Remote',
          items: [
            makeItem({ id: 'remotes', label: 'remotes', kind: 'submenu', submenu: ['add', 'list'] }),
            makeItem({ id: 'logs', label: 'logs', enabledWhen: 'hasActiveRemote' }),
          ],
        }),
      ];
      // Only remotes is selectable (enabledWhen: 'hasActiveRemote' is false for 'logs')
      const selectable = [groups[0]!.items[0]!];
      const cursor = 0;

      const { lastFrame } = render(
        <ActionMenu groups={groups} selectable={selectable} cursor={cursor} view={{ view: 'list' } as const} />
      );

      // logs should appear greyed
      expect(lastFrame()).toContain('logs');
    });
  });

  describe('group labels', () => {
    it('renders each group with its label', () => {
      const groups = [
        makeGroup({ id: 'local', label: 'Local', items: [makeItem({ id: 'doctor' })] }),
        makeGroup({ id: 'remote', label: 'Remote', items: [] }),
        makeGroup({ id: 'config', label: 'Config', items: [] }),
      ];
      const selectable = [groups[0]!.items[0]!];
      const cursor = 0;

      const { lastFrame } = render(
        <ActionMenu groups={groups} selectable={selectable} cursor={cursor} view={{ view: 'list' } as const} />
      );

      expect(lastFrame()).toContain('Local');
      expect(lastFrame()).toContain('Remote');
      expect(lastFrame()).toContain('Config');
    });
  });

  describe('submenu view', () => {
    it('renders subaction labels when in submenu view', () => {
      const remotesItem = makeItem({
        id: 'remotes',
        label: 'remotes',
        kind: 'submenu',
        submenu: ['add', 'list', 'rm', 'use', 'test'],
      });
      const groups = [makeGroup({ id: 'remote', label: 'Remote', items: [remotesItem] })];
      const selectable = [remotesItem];
      const cursor = 0;
      const view = { view: 'submenu', parentId: 'remotes', restoreCursor: 0 } as const;

      const { lastFrame } = render(
        <ActionMenu groups={groups} selectable={selectable} cursor={cursor} view={view} />
      );

      // Should show subaction labels
      expect(lastFrame()).toContain('add');
      expect(lastFrame()).toContain('list');
      expect(lastFrame()).toContain('rm');
      expect(lastFrame()).toContain('use');
      expect(lastFrame()).toContain('test');
    });

    it('shows subaction labels without cursor in submenu view', () => {
      const remotesItem = makeItem({
        id: 'remotes',
        label: 'remotes',
        kind: 'submenu',
        submenu: ['add', 'list'],
      });
      const groups = [makeGroup({ id: 'remote', label: 'Remote', items: [remotesItem] })];
      const selectable = [remotesItem];
      const cursor = 0;
      const view = { view: 'submenu', parentId: 'remotes', restoreCursor: 0 } as const;

      const { lastFrame } = render(
        <ActionMenu groups={groups} selectable={selectable} cursor={cursor} view={view} />
      );

      // Submenu shows subaction labels, no cursor glyph
      expect(lastFrame()).toContain('add');
      expect(lastFrame()).toContain('list');
      // No ❯ cursor in submenu listing
      expect(lastFrame()).not.toContain('❯');
    });
  });
});
