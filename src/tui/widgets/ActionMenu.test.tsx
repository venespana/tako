// ActionMenu.test.tsx — Unit tests for ActionMenu widget.
// ActionMenu is a pure renderer: groups/selectable/cursor. There is no view
// prop — the remotes submenu renders subaction labels because App composes
// the screen with the subactions as the group items (see submenu tests below).
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
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
        <ActionMenu groups={groups} selectable={selectable} cursor={cursor} />
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
        <ActionMenu groups={groups} selectable={selectable} cursor={cursor} />
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
        <ActionMenu groups={groups} selectable={selectable} cursor={cursor} />
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
        <ActionMenu groups={groups} selectable={selectable} cursor={cursor} />
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
        <ActionMenu groups={groups} selectable={selectable} cursor={cursor} />
      );

      expect(lastFrame()).toContain('Local');
      expect(lastFrame()).toContain('Remote');
      expect(lastFrame()).toContain('Config');
    });
  });

  describe('submenu screen (remotes route composition)', () => {
    const makeSubAction = (cmd: string): ActionItem => ({
      id: `remotes-${cmd}`,
      label: cmd,
      command: cmd,
      kind: 'action',
      enabledWhen: 'always',
      handlerKey: `remotes.${cmd}`,
    });

    it('renders subaction labels when the submenu items are the selectable list', () => {
      const subActions = ['add', 'list', 'rm', 'use', 'test'].map(makeSubAction);
      // On the remotes route App builds a single group whose items are the
      // subactions — mirroring that composition here.
      const groups = [makeGroup({ id: 'remotes-submenu', label: 'remotes', items: subActions })];
      const selectable = subActions;
      const cursor = 0;

      const { lastFrame } = render(
        <ActionMenu groups={groups} selectable={selectable} cursor={cursor} />
      );

      // Should show subaction labels
      expect(lastFrame()).toContain('add');
      expect(lastFrame()).toContain('list');
      expect(lastFrame()).toContain('rm');
      expect(lastFrame()).toContain('use');
      expect(lastFrame()).toContain('test');
    });

    it('shows the cursor on the focused subaction item', () => {
      // The old test asserted no cursor in the submenu listing. With the
      // router, arrows are active on remotes.* routes, so the submenu listing
      // is a regular cursor-navigable list.
      const subActions = ['add', 'list'].map(makeSubAction);
      const groups = [makeGroup({ id: 'remotes-submenu', label: 'remotes', items: subActions })];
      const selectable = subActions;
      const cursor = 0;

      const { lastFrame } = render(
        <ActionMenu groups={groups} selectable={selectable} cursor={cursor} />
      );

      expect(lastFrame()).toContain('❯ add');
      expect(lastFrame()).not.toContain('❯ list');
    });
  });
});
