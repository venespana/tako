// router-store.test.ts — Unit tests for Zustand router store.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useRouterStore, setExitHandler } from './router-store.js';

// Reset store between tests
beforeEach(() => {
  useRouterStore.setState({
    currentRoute: 'home',
    params: {},
    history: [],
  });
  setExitHandler(() => {});
});

describe('useRouterStore', () => {
  describe('navigate', () => {
    it('sets currentRoute and pushes history', () => {
      const { navigate } = useRouterStore.getState();
      navigate('doctor');
      const { currentRoute, history } = useRouterStore.getState();
      expect(currentRoute).toBe('doctor');
      expect(history).toEqual([{ route: 'home', params: {} }]);
    });

    it('deduplicates: same route only updates params', () => {
      const store = useRouterStore.getState();
      store.navigate('doctor');
      store.navigate('doctor', { verbose: true });
      const { currentRoute, params, history } = useRouterStore.getState();
      expect(currentRoute).toBe('doctor');
      expect(params).toEqual({ verbose: true });
      expect(history).toHaveLength(1);
    });

    it('caps history at 20', () => {
      const { navigate } = useRouterStore.getState();
      // Push 21 entries
      for (let i = 0; i < 21; i++) {
        navigate('logs');
        navigate('home');
      }
      const { history } = useRouterStore.getState();
      expect(history).toHaveLength(20);
    });
  });

  describe('goBack', () => {
    it('pops history and restores prior route', () => {
      const { navigate, goBack } = useRouterStore.getState();
      navigate('doctor');
      goBack();
      const { currentRoute, history } = useRouterStore.getState();
      expect(currentRoute).toBe('home');
      expect(history).toHaveLength(0);
    });

    it('calls exit handler when history is empty', () => {
      const exitMock = vi.fn();
      setExitHandler(exitMock);
      const { goBack } = useRouterStore.getState();
      goBack();
      expect(exitMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('setExitHandler', () => {
    it('wires the provided function to be called on empty-history goBack', () => {
      const mockExit = vi.fn();
      setExitHandler(mockExit);
      useRouterStore.getState().goBack();
      expect(mockExit).toHaveBeenCalled();
    });
  });
});
