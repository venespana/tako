// App.test.tsx — Integration tests for the App component.
// Tests the full keypress flow using ink-testing-library against the
// react-router data router: the persistent chrome (logo on EVERY screen,
// selected remote name once chosen, contextual footer), menus as pages
// (home at '/', remotes selection + submenu at '/remotes'), one screen at
// a time (no master-detail), Enter-driven navigation, linear Escape back,
// and q/Ctrl-C quit while other ctrl combos don't. Router state is asserted
// through rendered frames: each App mount owns a fresh router, so there is
// no shared singleton to reset between tests.
//
// The remotes stack is mocked (partial module mock, the repo's ink-mock
// pattern) so the selection screen reads a deterministic conf-free list.
//
// Keypresses use pressAndSettle: a freshly mounted page's first frame can
// paint before Ink's useInput effect subscription runs (React 19 delays
// passive effects under load), so keys written in that window are dropped.
// Each press verifies its expected frame change and retries once if lost.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import { pressAndSettle, settle, wait } from '../test-utils/ink-interactions.js';
import App from './App.js';

// Capture App's exit() calls so quit-key tests can assert on them without
// depending on Ink's unmount internals. ink-testing-library renders with
// exitOnCtrlC: false, so Ctrl+C is delivered to our useInput handler.
const { exitMock, listRemotes } = vi.hoisted(() => ({
  exitMock: vi.fn(),
  listRemotes: vi.fn(),
}));

vi.mock('ink', async importOriginal => {
  const actual = await importOriginal<typeof import('ink')>();
  return { ...actual, useApp: () => ({ exit: exitMock }) };
});

vi.mock('./remotes-stack.js', () => ({
  getRemotesStack: () => ({
    repository: { list: listRemotes },
    addRemote: {},
  }),
}));

// Mock Bun globally so LocalHostToolChecker doesn't fail in tests
const { fakeDoctorResult } = vi.hoisted(() => ({
  fakeDoctorResult: {
    results: [
      { tool: 'ssh', status: 'found', version: 'OpenSSH_10.4p1' },
      { tool: 'ssl', status: 'found', version: '3.6.3' },
      { tool: 'git', status: 'found', version: '2.55.0' },
      { tool: 'docker', status: 'found', version: '29.7.2' },
      { tool: 'docker-compose', status: 'found', version: 'v2.24.0' },
    ],
    allPresent: true,
  },
}));

vi.stubGlobal('Bun', {
  spawn: vi.fn(() => ({
    exited: 0,
    stdout: { text: async () => 'OpenSSH_10.4p1' },
    stderr: { text: async () => '' },
  })),
});

beforeEach(() => {
  exitMock.mockReset();
  // One configured remote by default: entering /remotes shows the selection
  // screen instead of redirecting to the add wizard.
  listRemotes.mockReset();
  listRemotes.mockResolvedValue([{ name: 'nas', endpoint: 'ops@10.0.0.5:22' }]);
});

describe('App', () => {
  describe('initial render', () => {
    it('renders the home screen: logo, groups, and full menu hints', async () => {
      const { lastFrame, unmount } = render(<App />);
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

    it('starts with no active remote: gated items excluded, no name in chrome', async () => {
      const { stdin, lastFrame, unmount } = render(<App />);
      const frame = await settle(lastFrame, f => f.includes('❯ doctor'), 1000);

      // Session starts remote-less: no server name in the chrome and the
      // cursor wraps doctor↔remotes without reaching the gated logs item.
      expect(frame).not.toContain('nas');
      await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ remotes'));
      const wrapped = await pressAndSettle(
        stdin,
        lastFrame,
        'j',
        f => f.includes('❯ doctor') && !f.includes('❯ remotes')
      );
      expect(wrapped).not.toContain('❯ logs');
      unmount();
    });
  });

  describe('keyboard navigation', () => {
    it('moves the cursor down with j on home', async () => {
      const { stdin, lastFrame, unmount } = render(<App />);

      // Cursor starts on doctor (index 0); j moves to remotes (index 1)
      await settle(lastFrame, f => f.includes('❯ doctor'), 1000);
      const frame = await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ remotes'));
      expect(frame).toContain('❯ remotes');
      unmount();
    });

    it('moves the cursor up with the up arrow on home', async () => {
      const { stdin, lastFrame, unmount } = render(<App />);

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
      const { stdin, lastFrame, unmount } = render(<App />);
      await settle(lastFrame, f => f.includes('Local'), 1000);

      stdin.write('q');
      await wait(80);
      expect(exitMock).toHaveBeenCalledTimes(1);
      unmount();
    });

    it('Ctrl+A does not exit; Ctrl+C does', async () => {
      const { stdin, lastFrame, unmount } = render(<App />);

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

  describe('remote selection flow', () => {
    it('entering remotes shows the selection screen first (no active remote)', async () => {
      const { stdin, lastFrame, unmount } = render(<App />);

      await settle(lastFrame, f => f.includes('❯ doctor'), 1000);
      await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ remotes'));
      const frame = await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('Select a remote'));

      // Selection screen: configured remotes listed with cursor on the first
      expect(frame).toContain('Select a remote');
      expect(frame).toContain('❯ nas');
      // The submenu is NOT shown before a selection
      expect(frame).not.toContain('❯ add');
      unmount();
    });

    it('selecting a remote reveals the submenu and pins its name in the chrome', async () => {
      const { stdin, lastFrame, unmount } = render(<App />);

      await settle(lastFrame, f => f.includes('❯ doctor'), 1000);
      await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ remotes'));
      await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('Select a remote'));
      const frame = await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('❯ add'));

      // The submenu page shows the subcommand labels, cursor on the first
      expect(frame).toContain('add');
      expect(frame).toContain('list');
      expect(frame).toContain('rm');
      expect(frame).toContain('use');
      expect(frame).toContain('test');
      expect(frame).toContain('❯ add');
      // Logo persists, footer keeps the full menu hints…
      expect(frame).toContain('███╗');
      expect(frame).toContain('↑↓/j k');
      expect(frame).toContain('select');
      // …and the selected server name is now part of the chrome
      expect(frame).toContain('nas');
      unmount();
    });

    it('gated home items go live after a selection (logs reachable)', async () => {
      const { stdin, lastFrame, unmount } = render(<App />);

      await settle(lastFrame, f => f.includes('❯ doctor'), 1000);
      await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ remotes'));
      await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('Select a remote'));
      await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('❯ add'));

      // Back to home (selection persists for the session)
      await pressAndSettle(stdin, lastFrame, '\x1b', f => f.includes('❯ doctor'));

      // doctor → remotes → logs: the gated item is now selectable
      await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ remotes'));
      const frame = await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ logs'));
      expect(frame).toContain('❯ logs');
      unmount();
    });
  });

  describe('menus are pages', () => {
    it('navigates to the doctor command page on Enter (logo stays, footer shrinks)', async () => {
      const { stdin, lastFrame, unmount } = render(<App />);

      await settle(lastFrame, f => f.includes('❯ doctor'), 1000);
      // DoctorScreen shows tools with status — match 'ssh' to detect the page
      const frame = await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('ssh') && !f.includes('Local'));

      // Command page: logo PERSISTENT, home menu gone, back/quit hints only
      // DoctorScreen shows tool list with status (e.g. "ssh", "tools found")
      expect(frame).toContain('tools found');
      expect(frame).toContain('███╗');
      expect(frame).not.toContain('Local');
      expect(frame).not.toContain('❯');
      expect(frame).not.toContain('↑↓');
      expect(frame).not.toContain('select');
      expect(frame).toContain('back');
      expect(frame).toContain('quit');
      unmount();
    });

    it('renders ONLY the command page on /remotes/list (submenu is gone)', async () => {
      const { stdin, lastFrame, unmount } = render(<App />);

      await settle(lastFrame, f => f.includes('❯ doctor'), 1000);
      await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ remotes'));
      await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('Select a remote'));
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
      const { stdin, lastFrame, unmount } = render(<App />);

      await settle(lastFrame, f => f.includes('❯ doctor'), 1000);
      // DoctorScreen shows tools — match 'ssh' to detect the page
      const doctorFrame = await pressAndSettle(
        stdin,
        lastFrame,
        '\r',
        f => f.includes('ssh') && !f.includes('Local')
      );
      expect(doctorFrame).toContain('███╗');

      // Wait for the async check to complete (frame may change from checking → done)
      await wait(200);
      const doneFrame = lastFrame();

      // Arrow keys and Enter must be ignored: the frame does not change after stabilization
      stdin.write('j');
      stdin.write('\r');
      await wait(50);
      expect(lastFrame()).toBe(doneFrame);
      unmount();
    });
  });

  describe('linear back navigation', () => {
    it('walks back screen by screen: /remotes/list → /remotes → / → exit', async () => {
      const { stdin, lastFrame, unmount } = render(<App />);

      await settle(lastFrame, f => f.includes('❯ doctor'), 1000);
      await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ remotes'));
      await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('Select a remote'));
      await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('❯ add'));
      await pressAndSettle(stdin, lastFrame, 'j', f => f.includes('❯ list'));
      await pressAndSettle(stdin, lastFrame, '\r', f => f.includes('remotes.list'));

      // Ink buffers a lone trailing ESC (~20ms pendingInputFlushDelay). ESC
      // presses mid-flow are safe to retry: a dropped key was never
      // processed, and a processed one changes the frame within ~50ms.
      // Back to /remotes: the selection persists, so the SUBMENU shows.
      await pressAndSettle(stdin, lastFrame, '\x1b', f => f.includes('❯ add'));

      await pressAndSettle(stdin, lastFrame, '\x1b', f => f.includes('Local') && f.includes('❯ doctor'));

      // At home: nothing to pop → exit (asserted after the settle window)
      stdin.write('\x1b');
      await wait(80);
      expect(exitMock).toHaveBeenCalledTimes(1);
      unmount();
    });

    it('exits the app on Escape at home (no history to pop)', async () => {
      const { stdin, lastFrame, unmount } = render(<App />);
      await settle(lastFrame, f => f.includes('Local'), 1000);

      stdin.write('\x1b');
      await wait(80);
      expect(exitMock).toHaveBeenCalledTimes(1);
      unmount();
    });
  });
});
