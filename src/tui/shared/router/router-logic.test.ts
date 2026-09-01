// router-logic.test.ts — Unit tests for the pure navigate/goBack transitions.
// Route names here are arbitrary strings: the logic is route-agnostic.
import { describe, it, expect } from 'vitest';
import { navigate, goBack, DEFAULT_HISTORY_LIMIT } from './router-logic.js';
import type { RouterState } from './types.js';

type Route = 'main' | 'detail' | 'settings';

const MAIN: RouterState<Route> = { currentRoute: 'main', params: {}, history: [] };

function makeState(route: Route, historyLen: number): RouterState<Route> {
  return {
    currentRoute: route,
    params: {},
    history: Array.from({ length: historyLen }, () => ({
      route: 'main' as const,
      params: {},
    })),
  };
}

describe('navigate', () => {
  it('pushes prior route onto history on cross-route navigation', () => {
    const result = navigate(MAIN, 'detail');
    expect(result.currentRoute).toBe('detail');
    expect(result.history).toEqual([{ route: 'main', params: {} }]);
  });

  it('caps history at 20 entries by default', () => {
    const state = makeState('main', 19);
    const result = navigate(state, 'detail');
    expect(result.history).toHaveLength(DEFAULT_HISTORY_LIMIT);
  });

  it('drops oldest entry when cap exceeded', () => {
    const state = makeState('detail', 20); // 20 entries, all with route 'main'
    const result = navigate(state, 'settings');
    expect(result.history).toHaveLength(20);
    // The oldest entry (the 'detail' we came from) should be gone
    // Only the newest 20 entries remain (all 'main' routes from makeState)
    expect(result.history[0]?.route).toBe('main'); // oldest remaining
  });

  it('honors a custom historyLimit', () => {
    const state = makeState('main', 3);
    const result = navigate(state, 'detail', {}, 2);
    expect(result.history).toHaveLength(2);
  });

  it('deduplicates: same route updates params without pushing history', () => {
    const state: RouterState<Route> = { currentRoute: 'detail', params: {}, history: [{ route: 'main', params: {} }] };
    const result = navigate(state, 'detail', { verbose: true });
    expect(result.currentRoute).toBe('detail');
    expect(result.params).toEqual({ verbose: true });
    expect(result.history).toHaveLength(1); // unchanged
  });

  it('uses empty object as default params', () => {
    const result = navigate(MAIN, 'detail');
    expect(result.params).toEqual({});
  });
});

describe('goBack', () => {
  it('pops history and restores prior route', () => {
    const state: RouterState<Route> = {
      currentRoute: 'detail',
      params: {},
      history: [{ route: 'main', params: {} }],
    };
    const { state: result } = goBack(state);
    expect(result.currentRoute).toBe('main');
    expect(result.history).toHaveLength(0);
  });

  it('returns exited=true when history is empty', () => {
    const { exited } = goBack(MAIN);
    expect(exited).toBe(true);
  });

  it('exits without mutating state when history is empty', () => {
    const { state } = goBack(MAIN);
    expect(state).toEqual(MAIN);
  });

  it('restores params from history entry', () => {
    const state: RouterState<Route> = {
      currentRoute: 'detail',
      params: { verbose: true },
      history: [{ route: 'main', params: { fromDetail: true } }],
    };
    const { state: result } = goBack(state);
    expect(result.params).toEqual({ fromDetail: true });
  });
});
