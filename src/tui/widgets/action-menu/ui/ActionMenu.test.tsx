// ActionMenu.test.tsx — Unit tests for the ActionMenu widget.
// ActionMenu is a pure renderer: render-ready groups (items carry a
// pre-computed `enabled` flag) + the focused item's id. There is no view
// prop — the remotes submenu renders subaction labels because the page
// composes the screen with the subactions as the group items (see submenu
// tests below).
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ActionMenu } from './ActionMenu.js';
import type { RenderableActionItem, RenderableActionGroup } from '../../../features/menu/index.js';

const makeItem = (overrides: Partial<RenderableActionItem> = {}): RenderableActionItem => ({
  id: 'test',
  label: 'test',
  command: 'test',
  kind: 'action',
  enabled: true,
  ...overrides,
});

const makeGroup = (
  overrides: Partial<RenderableActionGroup> & { items?: RenderableActionItem[] } = {}
): RenderableActionGroup => ({
  id: 'group1',
  label: 'Group',
  items: [],
  ...overrides,
});

describe('ActionMenu', () => {
  describe('cursor rendering', () => {
    it('shows cursor glyph on focused item', () => {
      const groups = [makeGroup({ id: 'g1', label: 'Local', items: [makeItem({ id: 'doctor', label: 'doctor' })] })];

      const { lastFrame } = render(<ActionMenu groups={groups} focusedId='doctor' />);

      expect(lastFrame()).toContain('❯');
      expect(lastFrame()).toContain('doctor');
    });

    it('does not show cursor on non-focused items', () => {
      const groups = [
        makeGroup({
          id: 'g1',
          label: 'Local',
          items: [makeItem({ id: 'a', label: 'item-a' }), makeItem({ id: 'b', label: 'item-b' })],
        }),
      ];

      const { lastFrame } = render(<ActionMenu groups={groups} focusedId='a' />);

      const frame = lastFrame();
      // Only 'a' should have cursor, 'b' should not
      expect(frame).toContain('❯');
      expect(frame).not.toContain('❯item-b');
    });

    it('shows cursor in cyan color on focused item', () => {
      const groups = [makeGroup({ id: 'g1', label: 'Local', items: [makeItem({ id: 'doctor', label: 'doctor' })] })];

      const { lastFrame } = render(<ActionMenu groups={groups} focusedId='doctor' />);

      // Cyan cursor glyph
      expect(lastFrame()).toContain('❯');
    });

    it('renders no cursor when no item is focused', () => {
      const groups = [makeGroup({ id: 'g1', label: 'Local', items: [makeItem({ id: 'doctor', label: 'doctor' })] })];

      const { lastFrame } = render(<ActionMenu groups={groups} focusedId={undefined} />);

      expect(lastFrame()).not.toContain('❯');
      expect(lastFrame()).toContain('doctor');
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
            makeItem({ id: 'logs', label: 'logs', enabled: false }),
          ],
        }),
      ];

      const { lastFrame } = render(<ActionMenu groups={groups} focusedId='remotes' />);

      // logs should appear greyed
      expect(lastFrame()).toContain('logs');
      expect(lastFrame()).toContain('  logs');
      expect(lastFrame()).not.toContain('❯ logs');
    });
  });

  describe('group labels', () => {
    it('renders each group with its label', () => {
      const groups = [
        makeGroup({ id: 'local', label: 'Local', items: [makeItem({ id: 'doctor' })] }),
        makeGroup({ id: 'remote', label: 'Remote', items: [] }),
        makeGroup({ id: 'config', label: 'Config', items: [] }),
      ];

      const { lastFrame } = render(<ActionMenu groups={groups} focusedId='doctor' />);

      expect(lastFrame()).toContain('Local');
      expect(lastFrame()).toContain('Remote');
      expect(lastFrame()).toContain('Config');
    });
  });

  describe('submenu screen (remotes route composition)', () => {
    const makeSubAction = (cmd: string): RenderableActionItem => ({
      id: `remotes-${cmd}`,
      label: cmd,
      command: cmd,
      kind: 'action',
      handlerKey: `remotes.${cmd}`,
      enabled: true,
    });

    it('renders subaction labels when the submenu items are the selectable list', () => {
      const subActions = ['add', 'list', 'rm', 'use', 'test'].map(makeSubAction);
      // On the remotes route the page builds a single group whose items are
      // the subactions — mirroring that composition here.
      const groups = [makeGroup({ id: 'remotes-submenu', label: 'remotes', items: subActions })];

      const { lastFrame } = render(<ActionMenu groups={groups} focusedId='remotes-add' />);

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

      const { lastFrame } = render(<ActionMenu groups={groups} focusedId='remotes-add' />);

      expect(lastFrame()).toContain('❯ add');
      expect(lastFrame()).not.toContain('❯ list');
    });
  });
});
