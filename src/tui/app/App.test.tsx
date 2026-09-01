// App.test.tsx — Integration tests for the App component.
// Tests the full keypress flow using ink-testing-library against the
// Zustand router store (route-driven navigation, cursor reset on route
// change, arrows active on home/remotes.* routes, ignored on isolated
// routes, Escape → goBack).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import App from './App.js';
import { useRouterStore, setExitHandler } from './router/index.js';
import type { ActionGroup, DispatchMap } from '../features/menu/types.js';

// The dispatch coverage needs an action item WITHOUT a route (Enter on such
// an item dispatches its handler). Every action in the real registry carries
// a route, so that single test swaps getRegistry() for a fixture via this
// override; all other tests use the real registry.
let registryOverride: ActionGroup[] | null = null;

vi.mock('../features/menu/registry.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../features/menu/registry.js')>();
  return {
    getRegistry: () => registryOverride ?? actual.getRegistry(),
  };
});

// Reset the shared router store between tests so each starts on 'home'.
beforeEach(() => {
  registryOverride = null;
  useRouterStore.setState({ currentRoute: 'home', params: {}, history: [] });
  setExitHandler(() => {});
});

// Ink buffers a lone trailing ESC for ~20ms (pendingInputFlushDelay) to
// disambiguate escape sequences, so ESC keypresses need a longer wait than
// plain keys to reach useInput.
const wait = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms));
const waitAfterEscape = () => wait(50);

describe('App', () => {
  describe('initial render', () => {
    it('renders the home screen with logo, groups, and key hints', () => {
      const dispatch: DispatchMap = { doctor: vi.fn() };
      const { lastFrame, unmount } = render(<App dispatch={dispatch} hasActiveRemote={false} />);

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

    it('does not call dispatch on initial render', () => {
      const dispatch: DispatchMap = { doctor: vi.fn() };
      const { unmount } = render(<App dispatch={dispatch} hasActiveRemote={false} />);
      expect((dispatch.doctor as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
      unmount();
    });
  });

  describe('keyboard navigation', () => {
    it('renders with cursor on first selectable item', () => {
      const dispatch: DispatchMap = { doctor: vi.fn() };
      const { lastFrame, unmount } = render(<App dispatch={dispatch} hasActiveRemote={false} />);

      // Cursor glyph appears on the first item (doctor)
      expect(lastFrame()).toContain('❯');
      expect(lastFrame()).toContain('❯ doctor');
      unmount();
    });

    it('moves the cursor down with j on home', async () => {
      const dispatch: DispatchMap = { doctor: vi.fn() };
      const { stdin, lastFrame, unmount } = render(<App dispatch={dispatch} hasActiveRemote={false} />);

      // Cursor starts on doctor (index 0); j moves to remotes (index 1)
      expect(lastFrame()).toContain('❯ doctor');
      stdin.write('j');
      await wait();
      expect(lastFrame()).toContain('❯ remotes');
      unmount();
    });

    it('moves the cursor up with the up arrow on home', async () => {
      const dispatch: DispatchMap = { doctor: vi.fn() };
      const { stdin, lastFrame, unmount } = render(<App dispatch={dispatch} hasActiveRemote={false} />);

      stdin.write('j'); // doctor → remotes
      await wait();
      stdin.write('\x1b[A'); // up arrow: remotes → doctor
      await wait();
      expect(lastFrame()).toContain('❯ doctor');
      unmount();
    });
  });

  describe('router navigation via Enter', () => {
    it('navigates to the doctor route on Enter over doctor (logo hidden)', async () => {
      const dispatch: DispatchMap = { doctor: vi.fn() };
      const { stdin, lastFrame, unmount } = render(<App dispatch={dispatch} hasActiveRemote={false} />);

      // Press Enter to select doctor — it is an action item WITH a route,
      // so Enter navigates instead of dispatching.
      stdin.write('\r');
      await wait();

      expect(useRouterStore.getState().currentRoute).toBe('doctor');
      // Isolated route: logo hidden, home menu groups gone
      expect(lastFrame()).not.toContain('███╗');
      expect(lastFrame()).not.toContain('Local');
      // Routing replaced the old dispatch behavior for routed actions
      expect(dispatch.doctor).not.toHaveBeenCalled();
      unmount();
    });

    it('navigates to the remotes submenu on Enter over remotes and resets the cursor', async () => {
      const { stdin, lastFrame, unmount } = render(<App dispatch={{}} hasActiveRemote={false} />);

      stdin.write('j'); // focus remotes (index 1) on home
      await wait();
      stdin.write('\r'); // Enter on submenu item → navigate to its route
      await wait();

      expect(useRouterStore.getState().currentRoute).toBe('remotes');
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
      const { stdin, lastFrame, unmount } = render(<App dispatch={{}} hasActiveRemote={false} />);

      stdin.write('j'); // home: focus remotes
      await wait();
      stdin.write('\r'); // enter remotes submenu
      await wait();
      stdin.write('j'); // arrows work on remotes.* routes: add → list
      await wait();
      stdin.write('\r'); // Enter on routed action item → navigate
      await wait();

      expect(useRouterStore.getState().currentRoute).toBe('remotes.list');
      expect(lastFrame()).toContain('remotes.list');
      unmount();
    });

    it('dispatches the handler for an action item without a route', async () => {
      // Preserves the old dispatch coverage: Enter on an action item whose
      // handlerKey has no route invokes dispatch[handlerKey] and stays put.
      registryOverride = [
        {
          id: 'local',
          label: 'Local',
          items: [
            {
              id: 'doctor',
              label: 'doctor',
              command: 'doctor',
              kind: 'action',
              enabledWhen: 'always',
              handlerKey: 'doctor',
            },
          ],
        },
      ];
      const doctorFn = vi.fn().mockResolvedValue(undefined);
      const dispatch: DispatchMap = { doctor: doctorFn };
      const { stdin, unmount } = render(<App dispatch={dispatch} hasActiveRemote={false} />);

      stdin.write('\r');
      await wait();

      expect(doctorFn).toHaveBeenCalled();
      expect(useRouterStore.getState().currentRoute).toBe('home');
      unmount();
    });
  });

  describe('router navigation via Escape', () => {
    it('returns to the previous route on Escape', async () => {
      const { stdin, lastFrame, unmount } = render(<App dispatch={{}} hasActiveRemote={false} />);

      stdin.write('\r'); // home → doctor
      await wait();
      expect(useRouterStore.getState().currentRoute).toBe('doctor');

      stdin.write('\x1b'); // Escape → goBack (flushed after Ink's pending-escape delay)
      await waitAfterEscape();
      expect(useRouterStore.getState().currentRoute).toBe('home');
      expect(useRouterStore.getState().history).toEqual([]);
      // Back on home: logo and menu are visible again
      expect(lastFrame()).toContain('███╗');
      expect(lastFrame()).toContain('Local');
      unmount();
    });
  });

  describe('isolated routes (doctor/logs/status/cleanup)', () => {
    it('ignores arrows and Enter on isolated routes', async () => {
      const dispatch: DispatchMap = { doctor: vi.fn() };
      const { stdin, lastFrame, unmount } = render(<App dispatch={dispatch} hasActiveRemote={false} />);

      stdin.write('\r'); // home → doctor (isolated route)
      await wait();
      expect(useRouterStore.getState().currentRoute).toBe('doctor');

      // Arrow keys and Enter must be ignored: no navigation, no dispatch
      stdin.write('j');
      stdin.write('\r');
      await wait();

      expect(useRouterStore.getState().currentRoute).toBe('doctor');
      expect(lastFrame()).not.toContain('███╗');
      expect(dispatch.doctor).not.toHaveBeenCalled();
      unmount();
    });
  });
});
