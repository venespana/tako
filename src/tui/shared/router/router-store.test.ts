// router-store.test.ts — Unit tests for the per-instance Zustand store.
// A fresh store is created per test: no module-level state, no leakage.
import { describe, it, expect } from 'vitest';
import { createRouterStore } from './router-store.js';

type Route = 'main' | 'settings' | 'profile';

function makeStore(initialRoute: Route = 'main') {
  return createRouterStore<Route>({ initialRoute });
}

describe('createRouterStore', () => {
  describe('navigate', () => {
    it('sets currentRoute and pushes history', () => {
      const store = makeStore();
      store.getState().navigate('settings');
      const { currentRoute, history } = store.getState();
      expect(currentRoute).toBe('settings');
      expect(history).toEqual([{ route: 'main', params: {} }]);
    });

    it('deduplicates: same route only updates params', () => {
      const store = makeStore();
      store.getState().navigate('settings');
      store.getState().navigate('settings', { verbose: true });
      const { currentRoute, params, history } = store.getState();
      expect(currentRoute).toBe('settings');
      expect(params).toEqual({ verbose: true });
      expect(history).toHaveLength(1);
    });

    it('caps history at 20', () => {
      const store = makeStore();
      // Push 21 entries
      for (let i = 0; i < 21; i++) {
        store.getState().navigate('profile');
        store.getState().navigate('main');
      }
      const { history } = store.getState();
      expect(history).toHaveLength(20);
    });

    it('honors a custom historyLimit from options', () => {
      const store = createRouterStore<Route>({ initialRoute: 'main', historyLimit: 3 });
      for (const route of ['settings', 'profile', 'main', 'settings'] as Route[]) {
        store.getState().navigate(route);
      }
      expect(store.getState().history).toHaveLength(3);
    });

    it('uses initialParams for the initial route', () => {
      const store = createRouterStore<Route>({ initialRoute: 'settings', initialParams: { verbose: true } });
      expect(store.getState().params).toEqual({ verbose: true });
    });
  });

  describe('goBack', () => {
    it('pops history, restores prior route, and returns false', () => {
      const store = makeStore();
      store.getState().navigate('settings');
      const exited = store.getState().goBack();
      const { currentRoute, history } = store.getState();
      expect(exited).toBe(false);
      expect(currentRoute).toBe('main');
      expect(history).toHaveLength(0);
    });

    it('returns true (exit signal) when history is empty and leaves state untouched', () => {
      const store = makeStore();
      const exited = store.getState().goBack();
      expect(exited).toBe(true);
      expect(store.getState()).toMatchObject({ currentRoute: 'main', history: [] });
    });
  });

  describe('isolation', () => {
    it('two stores do not share state', () => {
      const a = makeStore();
      const b = makeStore();
      a.getState().navigate('settings');
      expect(a.getState().currentRoute).toBe('settings');
      expect(b.getState().currentRoute).toBe('main');
    });
  });
});
