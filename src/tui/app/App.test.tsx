// App.test.tsx — Integration tests for the App component.
// Tests the full keypress flow using ink-testing-library.
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import App from './App.js';
import type { DispatchMap } from '../features/menu/types.js';

describe('App', () => {
  describe('initial render', () => {
    it('renders the home screen with logo, groups, and key hints', () => {
      const dispatch: DispatchMap = { doctor: vi.fn() };
      const { lastFrame } = render(<App dispatch={dispatch} hasActiveRemote={false} />);

      // Logo renders (box characters)
      expect(lastFrame()).toContain('███╗');
      // Groups render
      expect(lastFrame()).toContain('Local');
      expect(lastFrame()).toContain('Remote');
      expect(lastFrame()).toContain('Config');
      // Key hints
      expect(lastFrame()).toContain('q');
      expect(lastFrame()).toContain('↑↓');
    });

    it('does not call dispatch on initial render', () => {
      const dispatch: DispatchMap = { doctor: vi.fn() };
      render(<App dispatch={dispatch} hasActiveRemote={false} />);
      expect((dispatch.doctor as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    });
  });

  describe('keyboard navigation', () => {
    it('renders with cursor on first selectable item', () => {
      const dispatch: DispatchMap = { doctor: vi.fn() };
      const { lastFrame } = render(<App dispatch={dispatch} hasActiveRemote={false} />);

      // Cursor glyph appears
      expect(lastFrame()).toContain('❯');
    });
  });

  describe('doctor dispatch', () => {
    it('calls dispatch.doctor when Enter is pressed on doctor', async () => {
      const doctorFn = vi.fn().mockResolvedValue(undefined);
      const dispatch: DispatchMap = { doctor: doctorFn };
      const { stdin } = render(<App dispatch={dispatch} hasActiveRemote={false} />);

      // Press Enter to select doctor
      stdin.write('\r');

      // Wait for the dispatch to be called
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(doctorFn).toHaveBeenCalled();
    });
  });
});
