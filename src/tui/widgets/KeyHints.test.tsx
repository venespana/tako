// KeyHints.test.tsx — Unit tests for the KeyHints widget.
// Menu screens (selectableItems) show movement + select hints; command
// pages show back/quit only. Back/quit are always visible (Esc/⌫/h →
// navigate(-1), exit at home).
import { describe, it, expect } from 'vitest';
import { renderToString } from 'ink';
import { KeyHints } from './KeyHints.js';

describe('KeyHints', () => {
  describe('menu screens (selectableItems)', () => {
    it('renders movement key hints', () => {
      const output = renderToString(<KeyHints selectableItems={true} />);
      expect(output).toContain('↑↓/j k');
    });

    it('renders the select hint', () => {
      const output = renderToString(<KeyHints selectableItems={true} />);
      expect(output).toContain('Enter/l');
      expect(output).toContain('select');
    });

    it('renders back and quit hints', () => {
      const output = renderToString(<KeyHints selectableItems={true} />);
      expect(output).toContain('h/Esc');
      expect(output).toContain('back');
      expect(output).toContain('q');
      expect(output).toContain('quit');
    });
  });

  describe('command pages (no selectable list)', () => {
    it('omits the movement and select hints', () => {
      const output = renderToString(<KeyHints selectableItems={false} />);
      expect(output).not.toContain('↑↓');
      expect(output).not.toContain('select');
    });

    it('still renders back and quit hints', () => {
      const output = renderToString(<KeyHints selectableItems={false} />);
      expect(output).toContain('h/Esc');
      expect(output).toContain('back');
      expect(output).toContain('q');
      expect(output).toContain('quit');
    });
  });
});
