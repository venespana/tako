// KeyHints.test.tsx — Unit tests for the KeyHints widget.
// Menu screens (selectableItems) show movement + select hints; command
// pages show back/quit only. Back/quit are always visible (Esc/⌫/h →
// navigate(-1), exit at home). 9.15a: pages publish a semantic hint list —
// rendered left-to-right in declared order, with back/quit ALWAYS last.
import { renderToString } from 'ink';

import { describe, it, expect } from 'vitest';

import { KeyHints } from './KeyHints.js';

// 9.15a semantic hint list (the KeyHint shape lands with the shared page-hints store).
const TASKS_HINTS = [
  { key: 'n', label: 'new' },
  { key: 'r', label: 'dry-run' },
  { key: 'a', label: 'apply' },
  { key: 'e', label: 'edit' },
  { key: 'd', label: 'delete' },
];

/** Positions of every label in the rendered frame (indexOf order check). */
function labelPositions(output: string, labels: readonly string[]): number[] {
  return labels.map(label => {
    const at = output.indexOf(label);
    expect(at).toBeGreaterThanOrEqual(0);
    return at;
  });
}

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

  describe('page hints (9.15a: the only place key hints render)', () => {
    it('renders page hints left-to-right in declared order, before back/quit', () => {
      const output = renderToString(<KeyHints selectableItems={false} hints={TASKS_HINTS} />);
      const positions = labelPositions(output, ['new', 'dry-run', 'apply', 'edit', 'delete', 'back', 'quit']);
      for (let i = 1; i < positions.length; i += 1) {
        expect(positions[i]).toBeGreaterThan(positions[i - 1]!);
      }
    });

    it('renders back/quit last even when the screen is a menu with page hints', () => {
      const output = renderToString(<KeyHints selectableItems={true} hints={TASKS_HINTS} />);
      const positions = labelPositions(output, ['new', 'delete', 'back', 'quit']);
      for (let i = 1; i < positions.length; i += 1) {
        expect(positions[i]).toBeGreaterThan(positions[i - 1]!);
      }
    });

    it('does not render the movement hints once a page declares its own hints', () => {
      const output = renderToString(<KeyHints selectableItems={true} hints={TASKS_HINTS} />);
      expect(output).not.toContain('↑↓');
    });

    it('9.20: formMode suppresses back/quit (dead keys while a form owns the keyboard)', () => {
      const output = renderToString(<KeyHints selectableItems={false} hints={TASKS_HINTS} formMode={true} />);
      expect(output).not.toContain('back');
      expect(output).not.toContain('quit');
      expect(output).toContain('new');
      expect(output).toContain('dry-run');
    });
  });
});
