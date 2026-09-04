// KeyHints.test.tsx — Unit tests for KeyHints widget.
import { describe, it, expect } from 'vitest';
import { renderToString } from 'ink';
import { KeyHints } from './KeyHints.js';
import type { ViewState } from '../features/menu/types.js';

describe('KeyHints', () => {
  describe('list view', () => {
    it('renders movement key hints', () => {
      const view: ViewState = { view: 'list' };
      const output = renderToString(<KeyHints view={view} />);
      expect(output).toContain('↑↓');
      expect(output).toContain('j');
      expect(output).toContain('k');
    });

    it('renders select and quit hints in list view', () => {
      const view: ViewState = { view: 'list' };
      const output = renderToString(<KeyHints view={view} />);
      expect(output).toContain('Enter');
      expect(output).toContain('l');
      expect(output).toContain('q');
    });

    it('does not render back hint in list view', () => {
      const view: ViewState = { view: 'list' };
      const output = renderToString(<KeyHints view={view} />);
      expect(output).not.toContain('h');
      expect(output).not.toContain('Esc');
    });
  });

  describe('submenu view', () => {
    it('renders back hint in submenu view', () => {
      const view: ViewState = { view: 'submenu', parentId: 'remotes', restoreCursor: 0 };
      const output = renderToString(<KeyHints view={view} />);
      expect(output).toContain('h');
      expect(output).toContain('Esc');
    });

    it('still renders movement hints in submenu view', () => {
      const view: ViewState = { view: 'submenu', parentId: 'remotes', restoreCursor: 0 };
      const output = renderToString(<KeyHints view={view} />);
      expect(output).toContain('↑↓');
    });

    it('still renders select and quit hints in submenu view', () => {
      const view: ViewState = { view: 'submenu', parentId: 'remotes', restoreCursor: 0 };
      const output = renderToString(<KeyHints view={view} />);
      expect(output).toContain('Enter');
      expect(output).toContain('q');
    });
  });
});
