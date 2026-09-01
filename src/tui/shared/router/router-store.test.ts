// router-store.test.ts — Unit tests for the per-instance Zustand store.
// A fresh store is created per test: no module-level state, no leakage.
import { describe, it, expect } from 'vitest';
import { createRouterStore } from './router-store.js';

type Route = 'home' | 'doctor' | 'logs';

function makeStore(initialRoute: Route = 'home') {
  return createRouterStore<Route>({ initialRoute });
}

describe('createRouterStore', () => {
  describe('navigate', () => {
    it('sets currentRoute and pushes history', () => {
      const store = makeStore();
      store.getState().navigate('doctor');
      const { currentRoute, history } = store.getState();
      expect(currentRoute).toBe('doctor');
      expect(history).toEqual([{ route: 'home', params: {} }]);
    });

    it('deduplicates: same route only updates params', () => {
      const store = makeStore();
      store.getState().navigate('doctor');
      store.getState().navigate('doctor', { verbose: true });
      const { currentRoute, params, history } = store.getState();
      expect(currentRoute).toBe('doctor');
      expect(params).toEqual({ verbose: true });
      expect(history).toHaveLength(1);
    });

    it('caps history at 20', () => {
      const store = makeStore();
      // Push 21 entries
      for (let i = 0; i < 21; i++) {
        store.getState().navigate('logs');
        store.getState().navigate('home');
      }
      const { history } = store.getState();
      expect(history).toHaveLength(20);
    });

    it('honors a custom historyLimit from options', () => {
      const store = createRouterStore<Route>({ initialRoute: 'home', historyLimit: 3 });
      for (const route of ['doctor', 'logs', 'home', 'doctor'] as Route[]) {
        store.getState().navigate(route);
      }
      expect(store.getState().history).toHaveLength(3);
    });

    it('uses initialParams for the initial route', () => {
      const store = createRouterStore<Route>({ initialRoute: 'doctor', initialParams: { verbose: true } });
      expect(store.getState().params).toEqual({ verbose: true });
    });
  });

  describe('goBack', () => {
    it('pops history, restores prior route, and returns false', () => {
      const store = makeStore();
      store.getState().navigate('doctor');
      const exited = store.getState().goBack();
      const { currentRoute, history } = store.getState();
      expect(exited).toBe(false);
      expect(currentRoute).toBe('home');
      expect(history).toHaveLength(0);
    });

    it('returns true (exit signal) when history is empty and leaves state untouched', () => {
      const store = makeStore();
      const exited = store.getState().goBack();
      expect(exited).toBe(true);
      expect(store.getState()).toMatchObject({ currentRoute: 'home', history: [] });
    });
  });

  describe('isolation', () => {
    it('two stores do not share state', () => {
      const a = makeStore();
      const b = makeStore();
      a.getState().navigate('doctor');
      expect(a.getState().currentRoute).toBe('doctor');
      expect(b.getState().currentRoute).toBe('home');
    });
  });
});
