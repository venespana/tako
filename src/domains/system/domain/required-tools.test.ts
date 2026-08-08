// required-tools.test.ts — STRICT TDD RED phase
import { describe, it, expect } from 'vitest';
import { REQUIRED_HOST_TOOLS } from './required-tools.js';

describe('REQUIRED_HOST_TOOLS', () => {
  it('3.4 RED: exactly 5 items in correct order', () => {
    expect(REQUIRED_HOST_TOOLS).toHaveLength(5);
    expect(REQUIRED_HOST_TOOLS[0]).toBe('ssh');
    expect(REQUIRED_HOST_TOOLS[1]).toBe('ssl');
    expect(REQUIRED_HOST_TOOLS[2]).toBe('git');
    expect(REQUIRED_HOST_TOOLS[3]).toBe('docker');
    expect(REQUIRED_HOST_TOOLS[4]).toBe('docker-compose');
  });
});
