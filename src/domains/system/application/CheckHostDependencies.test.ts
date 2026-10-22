// CheckHostDependencies.test.ts — STRICT TDD RED phase
import { describe, it, expect, vi } from 'vitest';

import { CheckHostDependencies } from './CheckHostDependencies.js';
import type { HostToolChecker } from './HostToolChecker.js';
import type { HostTool, ToolCheckResult } from '../domain/types.js';

// We import the use case class that doesn't exist yet — this is RED

describe('CheckHostDependencies', () => {
  // Helper to create a fake checker
  function fakeChecker(results: ToolCheckResult[]): HostToolChecker {
    return {
      check: vi.fn(async (tool: HostTool) => {
        const result = results.find(r => r.tool === tool);

        if (!result) throw new Error(`Unexpected tool: ${tool}`);

        return result;
      }),
    };
  }

  // SAFETY NET: verify the module doesn't exist yet (this test file imports CheckHostDependencies
  // which will fail to compile until we create it — this is intentional RED behavior)
  it('RED: CheckHostDependencies class should not exist yet', () => {
    // This test will fail compilation until we create the class
    expect(typeof CheckHostDependencies).toBe('function');
  });

  it('3.1 RED: all tools found → allPresent=true, results.length=5', async () => {
    const fake = fakeChecker([
      { tool: 'ssh', status: 'found', version: '9.0' },
      { tool: 'ssl', status: 'found', version: '3.0.0' },
      { tool: 'git', status: 'found', version: '2.43.0' },
      { tool: 'docker', status: 'found', version: '24.0.0' },
      { tool: 'docker-compose', status: 'found', version: 'v2.24.0' },
    ]);

    const useCase = new CheckHostDependencies(fake);
    const result = await useCase.checkAll();

    expect(result.allPresent).toBe(true);
    expect(result.results).toHaveLength(5);
  });

  it('3.2 RED: partial missing → allPresent=false, correct status per tool', async () => {
    const fake = fakeChecker([
      { tool: 'ssh', status: 'found', version: '9.0' },
      { tool: 'ssl', status: 'found', version: '3.0.0' },
      { tool: 'git', status: 'not-found', version: null },
      { tool: 'docker', status: 'found', version: '24.0.0' },
      { tool: 'docker-compose', status: 'found', version: 'v2.24.0' },
    ]);

    const useCase = new CheckHostDependencies(fake);
    const result = await useCase.checkAll();

    expect(result.allPresent).toBe(false);
    expect(result.results).toHaveLength(5);

    const gitResult = result.results.find(r => r.tool === 'git');
    expect(gitResult!.status).toBe('not-found');
    expect(gitResult!.version).toBeNull();

    const sshResult = result.results.find(r => r.tool === 'ssh');
    expect(sshResult!.status).toBe('found');

    const dockerResult = result.results.find(r => r.tool === 'docker');
    expect(dockerResult!.status).toBe('found');

    const dcResult = result.results.find(r => r.tool === 'docker-compose');
    expect(dcResult!.status).toBe('found');
  });

  it('3.3 RED: all missing → allPresent=false', async () => {
    const fake = fakeChecker([
      { tool: 'ssh', status: 'not-found', version: null },
      { tool: 'ssl', status: 'not-found', version: null },
      { tool: 'git', status: 'not-found', version: null },
      { tool: 'docker', status: 'not-found', version: null },
      { tool: 'docker-compose', status: 'not-found', version: null },
    ]);

    const useCase = new CheckHostDependencies(fake);
    const result = await useCase.checkAll();

    expect(result.allPresent).toBe(false);
    expect(result.results).toHaveLength(5);
    expect(result.results.every(r => r.status === 'not-found')).toBe(true);
  });
});
