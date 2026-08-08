// LocalHostToolChecker.integ.test.ts — Integration test (GREEN)
// NOTE: This test requires Bun runtime context (bun test, not vitest)
// because Bun.spawn is a Bun-specific API not available in Node/vitest.
import { describe, it, expect } from 'vitest';
import { LocalHostToolChecker } from '../../../src/domains/system/infrastructure/LocalHostToolChecker.js';

describe('LocalHostToolChecker (integration)', () => {
  it('6.3 GREEN: real git on PATH → status:found, non-null version', async () => {
    const checker = new LocalHostToolChecker();
    const result = await checker.check('git');

    expect(result.tool).toBe('git');
    expect(result.status).toBe('found');
    expect(result.version).not.toBeNull();
    expect(result.version).toMatch(/^\d+\.\d+\.\d+$/); // e.g. "2.55.0"
  });
});
