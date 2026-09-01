// App.test.tsx — Integration tests for the App component.
// Tests the full keypress flow using ink-testing-library against the
// react-router data router (path-driven navigation, cursor reset on path
// change, arrows active on the visible menu — home registry or remotes
// submenu — ignored on isolated routes, Escape → back/exit, q/Ctrl-C quit
// while other ctrl combos don't). Router state is asserted through rendered
// frames: each App mount owns a fresh router, so there is no shared
// singleton to reset between tests.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import App from './App.js';

// Capture App's exit() calls so quit-key tests can assert on them without
// depending on Ink's unmount internals. ink-testing-library renders with
// exitOnCtrlC: false, so Ctrl+C is delivered to our useInput handler.
const { exitMock } = vi.hoisted(() => ({ exitMock: vi.fn() }));

vi.mock('ink', async importOriginal => {
  const actual = await importOriginal<typeof import('ink')>();
  return { ...actual, useApp: () => ({ exit: exitMock }) };
});

beforeEach(() => {
  exitMock.mockReset();
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

    it('renders with cursor on first selectable item', () => {
      const { lastFrame, unmount } = render(<App hasActiveRemote={false} />);

      // Cursor glyph appears on the first item (doctor)
      expect(lastFrame()).toContain('❯');
      expect(lastFrame()).toContain('❯ doctor');
      unmount();
    });
  });

  describe('keyboard navigation', () => {
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

  describe('navigation via Enter', () => {
    it('navigates to /doctor on Enter over doctor (logo hidden)', async () => {
      const { stdin, lastFrame, unmount } = render(<App hasActiveRemote={false} />);

      // Press Enter to select doctor — it is a routed action item,
      // so Enter navigates to its path.
      stdin.write('\r');
      await wait();

      // Isolated route: logo hidden, home menu groups gone, stub screen shown
      expect(lastFrame()).toContain('doctor');
      expect(lastFrame()).not.toContain('███╗');
      expect(lastFrame()).not.toContain('Local');
      unmount();
    });

    it('navigates to /remotes on Enter over remotes and resets the cursor', async () => {
      const { stdin, lastFrame, unmount } = render(<App hasActiveRemote={false} />);

      stdin.write('j'); // focus remotes (index 1) on home
      await wait();
      stdin.write('\r'); // Enter on submenu item → navigate to its path
      await wait();

      // The submenu screen shows the subaction labels as its selectable list
      expect(lastFrame()).toContain('add');
      expect(lastFrame()).toContain('list');
      expect(lastFrame()).toContain('rm');
      expect(lastFrame()).toContain('use');
      expect(lastFrame()).toContain('test');
      // Cursor reset to 0 on path change (was on index 1 before navigating)
      expect(lastFrame()).toContain('❯ add');
      unmount();
    });

    it('navigates to /remotes/list on Enter over a remotes subaction (submenu stays visible)', async () => {
      const { stdin, lastFrame, unmount } = render(<App hasActiveRemote={false} />);

      // NOTE: each keypress is its own stdin write — a combined 'j\r' chunk
      // reaches useInput as the single input string 'j\r', matching neither
      // the 'j' shortcut nor key.return.
      stdin.write('j'); // home: focus remotes
      await wait();
      stdin.write('\r'); // enter remotes submenu
      await wait();
      stdin.write('j'); // submenu: add → list
      await wait();
      stdin.write('\r'); // Enter on routed action item → navigate
      await wait();

      // Child page rendered (stub text)…
      expect(lastFrame()).toContain('remotes.list');
      // …and the master-detail layout keeps the submenu visible above it
      expect(lastFrame()).toContain('❯ add');
      unmount();
    });

    it('lets arrows + Enter drive the visible submenu from a remotes child page', async () => {
      // Inversion of the old ghost-menu regression: on /remotes/* child pages
      // the submenu is VISIBLE (master-detail), so arrows move its cursor and
      // Enter switches the outlet child.
      const { stdin, lastFrame, unmount } = render(<App hasActiveRemote={false} />);

      stdin.write('j'); // home: focus remotes
      await wait();
      stdin.write('\r'); // → /remotes
      await wait();
      stdin.write('j'); // submenu: add → list
      await wait();
      stdin.write('\r'); // → /remotes/list
      await wait();
      expect(lastFrame()).toContain('remotes.list');

      stdin.write('j'); // cursor reset to 'add' on path change; j → 'list'
      await wait();
      expect(lastFrame()).toContain('❯ list');

      stdin.write('\r'); // Enter on 'list' → same path → deduped no-op
      await wait();
      expect(lastFrame()).toContain('remotes.list');

      stdin.write('j'); // 'list' → 'rm'
      await wait();
      stdin.write('\r'); // Enter → outlet swaps to /remotes/rm
      await wait();
      expect(lastFrame()).toContain('remotes.rm');
      unmount();
    });
  });

  describe('isolated routes', () => {
    it('ignores arrows and Enter on /doctor', async () => {
      const { stdin, lastFrame, unmount } = render(<App hasActiveRemote={false} />);

      stdin.write('\r'); // home → /doctor (isolated route)
      await wait();
      expect(lastFrame()).toContain('doctor');
      expect(lastFrame()).not.toContain('███╗');

      // Arrow keys and Enter must be ignored: the frame does not change
      const before = lastFrame();
      stdin.write('j');
      stdin.write('\r');
      await wait();
      expect(lastFrame()).toBe(before);
      unmount();
    });
  });

  describe('navigation via Escape', () => {
    it('returns to the previous screen on Escape', async () => {
      const { stdin, lastFrame, unmount } = render(<App hasActiveRemote={false} />);

      stdin.write('\r'); // home → /doctor
      await wait();
      expect(lastFrame()).not.toContain('███╗');

      stdin.write('\x1b'); // Escape → history back (flushed after Ink's pending-escape delay)
      await waitAfterEscape();
      // Back on home: logo and menu are visible again
      expect(lastFrame()).toContain('███╗');
      expect(lastFrame()).toContain('Local');
      unmount();
    });

    it('exits the app on Escape at home (no history to pop)', async () => {
      const { stdin, unmount } = render(<App hasActiveRemote={false} />);

      stdin.write('\x1b');
      await waitAfterEscape();
      expect(exitMock).toHaveBeenCalledTimes(1);
      unmount();
    });
  });
});
