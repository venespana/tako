// App.test.tsx — Integration tests for the App component.
// Tests the full keypress flow using ink-testing-library against the
// app router instance (route-driven navigation, cursor reset on route
// change, arrows active on home/remotes.* routes, ignored on isolated
// routes, Escape → goBack, q/Ctrl-C quit while other ctrl combos don't).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import App from './App.js';
import { appRouter } from './app-router.js';

// Capture App's exit() calls so quit-key tests can assert on them without
// depending on Ink's unmount internals. ink-testing-library renders with
// exitOnCtrlC: false, so Ctrl+C is delivered to our useInput handler.
const { exitMock } = vi.hoisted(() => ({ exitMock: vi.fn() }));

vi.mock('ink', async importOriginal => {
  const actual = await importOriginal<typeof import('ink')>();
  return { ...actual, useApp: () => ({ exit: exitMock }) };
});

// Reset the app router instance between tests so each starts on 'home'.
beforeEach(() => {
  exitMock.mockReset();
  appRouter.reset();
  appRouter.setExitHandler(() => {});
});

// Ink buffers a lone trailing ESC for ~20ms (pendingInputFlushDelay) to
// disambiguate escape sequences, so ESC keypresses need a longer wait than
// plain keys to reach useInput.
const wait = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms));
const waitAfterEscape = () => wait(50);

describe('App', () => {
  describe('initial render', () => {
    it('renders the home screen with logo, groups, and key hints', () => {
      const { lastFrame, unmount } = render(<App hasActiveRemote={false} />);

      // Logo renders (box characters)
      expect(lastFrame()).toContain('███╗');
      // Groups render
      expect(lastFrame()).toContain('Local');
      expect(lastFrame()).toContain('Remote');
      expect(lastFrame()).toContain('Config');
      // Key hints
      expect(lastFrame()).toContain('q');
      expect(lastFrame()).toContain('↑↓');
      unmount();
    });
  });

  describe('keyboard navigation', () => {
    it('renders with cursor on first selectable item', () => {
      const { lastFrame, unmount } = render(<App hasActiveRemote={false} />);

      // Cursor glyph appears on the first item (doctor)
      expect(lastFrame()).toContain('❯');
      expect(lastFrame()).toContain('❯ doctor');
      unmount();
    });

    it('moves the cursor down with j on home', async () => {
      const { stdin, lastFrame, unmount } = render(<App hasActiveRemote={false} />);

      // Cursor starts on doctor (index 0); j moves to remotes (index 1)
      expect(lastFrame()).toContain('❯ doctor');
      stdin.write('j');
      await wait();
      expect(lastFrame()).toContain('❯ remotes');
      unmount();
    });

    it('moves the cursor up with the up arrow on home', async () => {
      const { stdin, lastFrame, unmount } = render(<App hasActiveRemote={false} />);

      stdin.write('j'); // doctor → remotes
      await wait();
      stdin.write('\x1b[A'); // up arrow: remotes → doctor
      await wait();
      expect(lastFrame()).toContain('❯ doctor');
      unmount();
    });
  });

  describe('quit keys', () => {
    it('Ctrl+A does not exit; Ctrl+C does', async () => {
      const { stdin, lastFrame, unmount } = render(<App hasActiveRemote={false} />);

      // Ctrl+A (\x01) parses as { input: 'a', ctrl: true } — must NOT quit
      stdin.write('\x01');
      await wait();
      expect(exitMock).not.toHaveBeenCalled();
      expect(lastFrame()).toContain('Local');

      // Ctrl+C (\x03) parses as { input: 'c', ctrl: true } — quits
      stdin.write('\x03');
      await wait();
      expect(exitMock).toHaveBeenCalledTimes(1);
      unmount();
    });
  });

  describe('router navigation via Enter', () => {
    it('navigates to the doctor route on Enter over doctor (logo hidden)', async () => {
      const { stdin, lastFrame, unmount } = render(<App hasActiveRemote={false} />);

      // Press Enter to select doctor — it is a routed action item,
      // so Enter navigates to its route.
      stdin.write('\r');
      await wait();

      expect(appRouter.getState().currentRoute).toBe('doctor');
      // Isolated route: logo hidden, home menu groups gone
      expect(lastFrame()).not.toContain('███╗');
      expect(lastFrame()).not.toContain('Local');
      unmount();
    });

    it('navigates to the remotes submenu on Enter over remotes and resets the cursor', async () => {
      const { stdin, lastFrame, unmount } = render(<App hasActiveRemote={false} />);

      stdin.write('j'); // focus remotes (index 1) on home
      await wait();
      stdin.write('\r'); // Enter on submenu item → navigate to its route
      await wait();

      expect(appRouter.getState().currentRoute).toBe('remotes');
      // The submenu screen shows the subaction labels as its selectable list
      expect(lastFrame()).toContain('add');
      expect(lastFrame()).toContain('list');
      expect(lastFrame()).toContain('rm');
      expect(lastFrame()).toContain('use');
      expect(lastFrame()).toContain('test');
      // Cursor reset to 0 on route change (was on index 1 before navigating)
      expect(lastFrame()).toContain('❯ add');
      unmount();
    });

    it('navigates to remotes.list on Enter over a remotes subaction', async () => {
      const { stdin, lastFrame, unmount } = render(<App hasActiveRemote={false} />);

      stdin.write('j'); // home: focus remotes
      await wait();
      stdin.write('\r'); // enter remotes submenu
      await wait();
      stdin.write('j'); // arrows work on remotes.* routes: add → list
      await wait();
      stdin.write('\r'); // Enter on routed action item → navigate
      await wait();

      expect(appRouter.getState().currentRoute).toBe('remotes.list');
      expect(lastFrame()).toContain('remotes.list');
      unmount();
    });
  });

  describe('router navigation via Escape', () => {
    it('returns to the previous route on Escape', async () => {
      const { stdin, lastFrame, unmount } = render(<App hasActiveRemote={false} />);

      stdin.write('\r'); // home → doctor
      await wait();
      expect(appRouter.getState().currentRoute).toBe('doctor');

      stdin.write('\x1b'); // Escape → goBack (flushed after Ink's pending-escape delay)
      await waitAfterEscape();
      expect(appRouter.getState().currentRoute).toBe('home');
      expect(appRouter.getState().history).toEqual([]);
      // Back on home: logo and menu are visible again
      expect(lastFrame()).toContain('███╗');
      expect(lastFrame()).toContain('Local');
      unmount();
    });
  });

  describe('isolated routes (doctor/logs/status/cleanup)', () => {
    it('ignores arrows and Enter on isolated routes', async () => {
      const { stdin, lastFrame, unmount } = render(<App hasActiveRemote={false} />);

      stdin.write('\r'); // home → doctor (isolated route)
      await wait();
      expect(appRouter.getState().currentRoute).toBe('doctor');

      // Arrow keys and Enter must be ignored: no navigation
      stdin.write('j');
      stdin.write('\r');
      await wait();

      expect(appRouter.getState().currentRoute).toBe('doctor');
      expect(lastFrame()).not.toContain('███╗');
      unmount();
    });
  });
});
