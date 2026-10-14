// domain/run.test.ts — STRICT TDD RED phase (task 3.4)
import { describe, it, expect } from 'vitest';

// RED: import the module that doesn't exist yet
import { canTransitionRun, transitionRun, IllegalRunTransitionError } from './run.js';
import type { RunStatus } from './types.js';

describe('run state machine (pending → running → succeeded|failed|unsupported)', () => {
  it('3.4 RED: pending may only start running', () => {
    expect(canTransitionRun('pending', 'running')).toBe(true);
    expect(canTransitionRun('pending', 'succeeded')).toBe(false);
    expect(canTransitionRun('pending', 'failed')).toBe(false);
    expect(canTransitionRun('pending', 'unsupported')).toBe(false);
    expect(canTransitionRun('pending', 'pending')).toBe(false);
  });

  it('3.4 RED: running may reach every terminal status', () => {
    expect(canTransitionRun('running', 'succeeded')).toBe(true);
    expect(canTransitionRun('running', 'failed')).toBe(true);
    expect(canTransitionRun('running', 'unsupported')).toBe(true);
  });

  it('3.4 RED: running may NOT go back to pending or loop to itself', () => {
    expect(canTransitionRun('running', 'pending')).toBe(false);
    expect(canTransitionRun('running', 'running')).toBe(false);
  });

  it('3.4 RED: terminal statuses are absorbing — no exit transitions', () => {
    const terminals: RunStatus[] = ['succeeded', 'failed', 'unsupported'];
    for (const from of terminals) {
      expect(canTransitionRun(from, 'pending')).toBe(false);
      expect(canTransitionRun(from, 'running')).toBe(false);
      expect(canTransitionRun(from, 'succeeded')).toBe(false);
      expect(canTransitionRun(from, 'failed')).toBe(false);
      expect(canTransitionRun(from, 'unsupported')).toBe(false);
    }
  });

  it('3.4 RED: transitionRun returns the target status on a legal move', () => {
    expect(transitionRun('pending', 'running')).toBe('running');
    expect(transitionRun('running', 'failed')).toBe('failed');
  });

  it('3.4 RED: transitionRun throws IllegalRunTransitionError on illegal moves', () => {
    expect(() => transitionRun('pending', 'succeeded')).toThrow(IllegalRunTransitionError);
    expect(() => transitionRun('succeeded', 'running')).toThrow(IllegalRunTransitionError);
    expect(() => transitionRun('running', 'pending')).toThrow(IllegalRunTransitionError);
  });

  it('3.4 RED: unsupported is ONLY reachable from running (never from pending)', () => {
    expect(() => transitionRun('pending', 'unsupported')).toThrow(IllegalRunTransitionError);
    expect(transitionRun('running', 'unsupported')).toBe('unsupported');
  });

  it('3.4 RED: error carries the rejected transition in its message', () => {
    try {
      transitionRun('succeeded', 'failed');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(IllegalRunTransitionError);
      expect((error as IllegalRunTransitionError).message).toContain('succeeded');
      expect((error as IllegalRunTransitionError).message).toContain('failed');
    }
  });
});
