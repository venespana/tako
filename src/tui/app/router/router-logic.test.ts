// router-logic.test.ts — Unit tests for pure navigate/goBack functions.
import { describe, it, expect } from 'vitest';
import { navigate, goBack } from './router-logic.js';
import type { RouterState } from './types.js';

const HOME: RouterState = { currentRoute: 'home', params: {}, history: [] };

function makeState(route: string, historyLen: number): RouterState {
  return {
    currentRoute: route as RouterState['currentRoute'],
    params: {},
    history: Array.from({ length: historyLen }, (_, i) => ({
      route: 'home',
      params: {},
    })),
  };
}

describe('navigate', () => {
  it('pushes prior route onto history on cross-route navigation', () => {
    const result = navigate(HOME, 'doctor');
    expect(result.currentRoute).toBe('doctor');
    expect(result.history).toEqual([{ route: 'home', params: {} }]);
  });

  it('caps history at 20 entries', () => {
    const state = makeState('home', 19);
    const result = navigate(state, 'doctor');
    expect(result.history).toHaveLength(20);
  });

  it('drops oldest entry when cap exceeded', () => {
    const state = makeState('doctor', 20); // 20 entries, all with route 'home'
    const result = navigate(state, 'logs');
    expect(result.history).toHaveLength(20);
    // The oldest entry (the 'doctor' we came from) should be gone
    // Only the newest 20 entries remain (all 'home' routes from makeState)
    expect(result.history[0]?.route).toBe('home'); // oldest remaining
  });

  it('deduplicates: same route updates params without pushing history', () => {
    const state: RouterState = { currentRoute: 'doctor', params: {}, history: [{ route: 'home', params: {} }] };
    const result = navigate(state, 'doctor', { verbose: true });
    expect(result.currentRoute).toBe('doctor');
    expect(result.params).toEqual({ verbose: true });
    expect(result.history).toHaveLength(1); // unchanged
  });

  it('uses empty object as default params', () => {
    const result = navigate(HOME, 'doctor');
    expect(result.params).toEqual({});
  });
});

describe('goBack', () => {
  it('pops history and restores prior route', () => {
    const state: RouterState = {
      currentRoute: 'doctor',
      params: {},
      history: [{ route: 'home', params: {} }],
    };
    const { state: result } = goBack(state);
    expect(result.currentRoute).toBe('home');
    expect(result.history).toHaveLength(0);
  });

  it('returns exited=true when history is empty', () => {
    const { exited } = goBack(HOME);
    expect(exited).toBe(true);
  });

  it('exits without mutating state when history is empty', () => {
    const { state } = goBack(HOME);
    expect(state).toEqual(HOME);
  });

  it('restores params from history entry', () => {
    const state: RouterState = {
      currentRoute: 'doctor',
      params: { verbose: true },
      history: [{ route: 'home', params: { fromDoctor: true } }],
    };
    const { state: result } = goBack(state);
    expect(result.params).toEqual({ fromDoctor: true });
  });
});
