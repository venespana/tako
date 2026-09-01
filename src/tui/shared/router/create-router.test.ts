// create-router.test.ts — Unit tests for the public router factory API.
// A fresh router is instantiated per test: no global state leakage.
import { describe, it, expect, vi } from 'vitest';
import { createRouter } from './create-router.js';

type Route = 'main' | 'settings' | 'profile';

function makeRouter(initialRoute: Route = 'main') {
  return createRouter<Route>({ initialRoute });
}

describe('createRouter', () => {
  describe('imperative API', () => {
    it('starts on the initial route with empty history', () => {
      const router = makeRouter();
      expect(router.getState()).toEqual({ currentRoute: 'main', params: {}, history: [] });
    });

    it('navigate updates state and pushes history', () => {
      const router = makeRouter();
      router.navigate('settings', { verbose: true });
      expect(router.getState().currentRoute).toBe('settings');
      expect(router.getState().params).toEqual({ verbose: true });
      expect(router.getState().history).toEqual([{ route: 'main', params: {} }]);
    });

    it('goBack pops history and returns false', () => {
      const router = makeRouter();
      router.navigate('settings');
      expect(router.goBack()).toBe(false);
      expect(router.getState().currentRoute).toBe('main');
      expect(router.getState().history).toEqual([]);
    });
  });

  describe('exit signal', () => {
    it('goBack on empty history returns true and fires the exit handler', () => {
      const router = makeRouter();
      const exitMock = vi.fn();
      router.setExitHandler(exitMock);
      expect(router.goBack()).toBe(true);
      expect(exitMock).toHaveBeenCalledTimes(1);
    });

    it('does not fire the exit handler after it is cleared with null', () => {
      const router = makeRouter();
      const exitMock = vi.fn();
      router.setExitHandler(exitMock);
      router.setExitHandler(null);
      router.goBack();
      expect(exitMock).not.toHaveBeenCalled();
    });

    it('exit handler is per-instance', () => {
      const a = makeRouter();
      const b = makeRouter();
      const exitA = vi.fn();
      a.setExitHandler(exitA);
      b.goBack();
      expect(exitA).not.toHaveBeenCalled();
    });
  });

  describe('subscribe', () => {
    it('notifies listeners on navigation and stops after unsubscribe', () => {
      const router = makeRouter();
      const listener = vi.fn();
      const unsubscribe = router.subscribe(listener);

      router.navigate('settings');
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      router.navigate('profile');
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('reset', () => {
    it('restores the initial route and clears history', () => {
      const router = makeRouter();
      router.navigate('settings');
      router.navigate('profile');
      router.reset();
      expect(router.getState()).toEqual({ currentRoute: 'main', params: {}, history: [] });
    });
  });

  describe('isolation', () => {
    it('two router instances do not share state or handlers', () => {
      const a = makeRouter();
      const b = makeRouter('settings');
      a.navigate('profile');

      expect(a.getState().currentRoute).toBe('profile');
      expect(b.getState().currentRoute).toBe('settings');

      const exitB = vi.fn();
      b.setExitHandler(exitB);
      a.goBack(); // a has history → pops, no exit
      expect(exitB).not.toHaveBeenCalled();
    });
  });

  describe('options', () => {
    it('honors historyLimit', () => {
      const router = createRouter<Route>({ initialRoute: 'main', historyLimit: 2 });
      for (const route of ['settings', 'profile', 'main', 'settings'] as Route[]) {
        router.navigate(route);
      }
      expect(router.getState().history).toHaveLength(2);
    });

    it('honors initialParams', () => {
      const router = createRouter<Route>({ initialRoute: 'settings', initialParams: { verbose: true } });
      expect(router.getState().params).toEqual({ verbose: true });
    });
  });
});
