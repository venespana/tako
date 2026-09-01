// App.test.tsx — Integration tests for the App component.
// Tests the full keypress flow using ink-testing-library against the
// react-router data router: the persistent chrome (logo on EVERY screen,
// contextual footer), menus as pages (home at '/', submenu at '/remotes'),
// one screen at a time (no master-detail), Enter-driven navigation, linear
// Escape back, and q/Ctrl-C quit while other ctrl combos don't. Router
// state is asserted through rendered frames: each App mount owns a fresh
// router, so there is no shared singleton to reset between tests.
//
// Keypresses use pressAndSettle: a freshly mounted page's first frame can
// paint before Ink's useInput effect subscription runs (React 19 delays
// passive effects under load), so keys written in that window are dropped.
// Each press verifies its expected frame change and retries once if lost.
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

type RenderResult = ReturnType<typeof render>;

const wait = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms));

/** Poll until predicate(frame) holds or the timeout elapses. */
async function settle(
  lastFrame: RenderResult['lastFrame'],
  predicate: (frame: string) => boolean,
  timeoutMs: number
): Promise<string> {
  let frame = lastFrame() ?? '';
  for (let waited = 0; !predicate(frame) && waited < timeoutMs; waited += 10) {
    await wait(10);
    frame = lastFrame() ?? '';
  }
  return frame;
}

// Ink flushes a processed key within ~32ms (frame throttle); anything past
// this means the key was dropped (pre-subscription window) and may be retried.
const KEY_FLUSH_MS = 350;

/** Write a key, waiting until the expected frame change is visible. A single
 * retry covers keys dropped before a freshly mounted page subscribed. Only
 * use with idempotent-in-context keys (navigation targets, no exit). */
async function pressAndSettle(
  stdin: RenderResult['stdin'],
  lastFrame: RenderResult['lastFrame'],
  key: string,
  expectFrame: (frame: string) => boolean
): Promise<string> {
  let frame = '';
  for (let attempt = 0; attempt < 2 && !expectFrame(frame); attempt++) {
    stdin.write(key);
    frame = await settle(lastFrame, expectFrame, KEY_FLUSH_MS);
  }
  return frame;
}

describe('App', () => {
  describe('initial render', () => {
    it('renders the home screen: logo, groups, and full menu hints', async () => {
      const { lastFrame, unmount } = render(<App hasActiveRemote={false} />);
      const frame = await settle(lastFrame, f => f.includes('Local'), 1000);

      // Logo renders (box characters)
      expect(frame).toContain('███╗');
      // Groups render
      expect(frame).toContain('Local');
      expect(frame).toContain('Remote');
      expect(frame).toContain('Config');
      // Full menu hints (movement + select + back + quit)
      expect(frame).toContain('↑↓/j k');
      expect(frame).toContain('select');
      expect(frame).toContain('back');
      expect(frame).toContain('quit');
      // Version
      expect(frame).toContain('v0.0.0');
      unmount();
    });

    it('renders with cursor on first selectable item', async () => {
      const { lastFrame, unmount } = render(<App hasActiveRemote={false} />);
      const frame = await settle(lastFrame, f => f.includes('Local'), 1000);

      // Cursor glyph appears on the first item (doctor)
      expect(frame).toContain('❯');
      expect(frame).toContain('❯ doctor');
      unmount();
    });
  });

  describe('keyboard navigation', () => {
    it('moves the cursor down with j on home', async () => {
      const { stdin, lastFrame, unmount } = render(<App hasActiveRemote={false} />);

      // Cursor starts on doctor (index 0); j moves to remotes (index 1)
      await settle(lastFrame, f => f.includes('❯ doctor'), 1000);
      const frame = await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ remotes'));
      expect(frame).toContain('❯ remotes');
      unmount();
    });

    it('moves the cursor up with the up arrow on home', async () => {
      const { stdin, lastFrame, unmount } = render(<App hasActiveRemote={false} />);

      await settle(lastFrame, f => f.includes('❯ doctor'), 1000);
      await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ remotes'));
      const frame = await pressAndSettle(
        stdin,
        lastFrame,
        '\x1b[A',
        f => f.includes('❯ doctor') && !f.includes('❯ remotes')
      );
      expect(frame).toContain('❯ doctor');
      unmount();
    });
  });

  describe('quit keys', () => {
    it('q quits', async () => {
      const { stdin, lastFrame, unmount } = render(<App hasActiveRemote={false} />);
      await settle(lastFrame, f => f.includes('Local'), 1000);

      stdin.write('q');
      await wait(80);
      expect(exitMock).toHaveBeenCalledTimes(1);
      unmount();
    });

    it('Ctrl+A does not exit; Ctrl+C does', async () => {
      const { stdin, lastFrame, unmount } = render(<App hasActiveRemote={false} />);

      await settle(lastFrame, f => f.includes('Local'), 1000);

      // Ctrl+A (\x01) parses as { input: 'a', ctrl: true } — must NOT quit
      stdin.write('\x01');
      await wait(50);
      expect(exitMock).not.toHaveBeenCalled();

      // Ctrl+C (\x03) parses as { input: 'c', ctrl: true } — quits
      stdin.write('\x03');
      await wait(80);
      expect(exitMock).toHaveBeenCalledTimes(1);
      unmount();
    });
  });

  describe('menus are pages', () => {
    it('navigates to the doctor command page on Enter (logo stays, footer shrinks)', async () => {
      const { stdin, lastFrame, unmount } = render(<App hasActiveRemote={false} />);

      await settle(lastFrame, f => f.includes('❯ doctor'), 1000);
      // 'doctor' alone matches the home menu too — require the menu to be gone
      const frame = await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('doctor') && !f.includes('Local'));

      // Command page: logo PERSISTENT, home menu gone, back/quit hints only
      expect(frame).toContain('doctor');
      expect(frame).toContain('███╗');
      expect(frame).not.toContain('Local');
      expect(frame).not.toContain('❯');
      expect(frame).not.toContain('↑↓');
      expect(frame).not.toContain('select');
      expect(frame).toContain('back');
      expect(frame).toContain('quit');
      unmount();
    });

    it('navigates to the remotes submenu page on Enter over remotes', async () => {
      const { stdin, lastFrame, unmount } = render(<App hasActiveRemote={false} />);

      await settle(lastFrame, f => f.includes('❯ doctor'), 1000);
      await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ remotes'));
      const frame = await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('❯ add'));

      // The submenu page shows the subcommand labels, cursor on the first
      expect(frame).toContain('add');
      expect(frame).toContain('list');
      expect(frame).toContain('rm');
      expect(frame).toContain('use');
      expect(frame).toContain('test');
      expect(frame).toContain('❯ add');
      // Logo persists and the footer keeps the full menu hints
      expect(frame).toContain('███╗');
      expect(frame).toContain('↑↓/j k');
      expect(frame).toContain('select');
      unmount();
    });

    it('renders ONLY the command page on /remotes/list (submenu is gone)', async () => {
      const { stdin, lastFrame, unmount } = render(<App hasActiveRemote={false} />);

      await settle(lastFrame, f => f.includes('❯ doctor'), 1000);
      await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ remotes'));
      await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('❯ add'));
      await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ list'));
      const frame = await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('remotes.list'));

      // Command page content…
      expect(frame).toContain('remotes.list');
      // …with the logo persistent and back/quit hints…
      expect(frame).toContain('███╗');
      expect(frame).toContain('h/Esc');
      // …but NO submenu: no cursor, no submenu labels, no movement/select hints
      expect(frame).not.toContain('❯');
      expect(frame).not.toContain('add');
      expect(frame).not.toContain('↑↓');
      expect(frame).not.toContain('select');
      unmount();
    });

    it('ignores arrows and Enter on a command page', async () => {
      const { stdin, lastFrame, unmount } = render(<App hasActiveRemote={false} />);

      await settle(lastFrame, f => f.includes('❯ doctor'), 1000);
      const doctorFrame = await pressAndSettle(
        stdin,
        lastFrame,
        '\r',
        f => f.includes('doctor') && !f.includes('Local')
      );
      expect(doctorFrame).toContain('███╗');

      // Arrow keys and Enter must be ignored: the frame does not change
      stdin.write('j');
      stdin.write('\r');
      await wait(50);
      expect(lastFrame()).toBe(doctorFrame);
      unmount();
    });
  });

  describe('linear back navigation', () => {
    it('walks back screen by screen: /remotes/list → /remotes → / → exit', async () => {
      const { stdin, lastFrame, unmount } = render(<App hasActiveRemote={false} />);

      await settle(lastFrame, f => f.includes('❯ doctor'), 1000);
      await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ remotes'));
      await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('❯ add'));
      await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ list'));
      await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('remotes.list'));

      // Ink buffers a lone trailing ESC (~20ms pendingInputFlushDelay). ESC
      // presses mid-flow are safe to retry: a dropped key was never
      // processed, and a processed one changes the frame within ~50ms.
      await pressAndSettle(stdin, lastFrame, '\x1b', f => f.includes('❯ add'));

      await pressAndSettle(stdin, lastFrame, '\x1b', f => f.includes('Local') && f.includes('❯ doctor'));

      // At home: nothing to pop → exit (asserted after the settle window)
      stdin.write('\x1b');
      await wait(80);
      expect(exitMock).toHaveBeenCalledTimes(1);
      unmount();
    });

    it('exits the app on Escape at home (no history to pop)', async () => {
      const { stdin, lastFrame, unmount } = render(<App hasActiveRemote={false} />);
      await settle(lastFrame, f => f.includes('Local'), 1000);

      stdin.write('\x1b');
      await wait(80);
      expect(exitMock).toHaveBeenCalledTimes(1);
      unmount();
    });
  });
});
