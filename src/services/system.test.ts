// services/system.test.ts — service-level test for the host dependency
// check: the service wires the local tool checker behind the use case and
// returns the typed report unchanged.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkHostDependencies } from './system.js';

const checkMock = vi.hoisted(() => vi.fn());

vi.mock('../domains/system/infrastructure/LocalHostToolChecker.js', () => ({
  LocalHostToolChecker: vi.fn(function () {
    return { check: checkMock };
  }),
}));

beforeEach(() => {
  checkMock.mockReset();
});

describe('checkHostDependencies', () => {
  it('every tool found → allPresent true, one check per required tool', async () => {
    checkMock.mockImplementation(async (tool: string) => ({ tool, status: 'found', path: `/usr/bin/${tool}` }));

    const report = await checkHostDependencies();

    expect(report.allPresent).toBe(true);
    expect(report.results).toHaveLength(5); // ssh, ssl, git, docker, docker-compose
  });

  it('a missing tool surfaces in the report and flips allPresent (exit-code input for the CLI)', async () => {
    checkMock.mockImplementation(async (tool: string) =>
      tool === 'docker-compose'
        ? { tool, status: 'not-found' }
        : { tool, status: 'found', path: `/usr/bin/${tool}` }
    );

    const report = await checkHostDependencies();

    expect(report.allPresent).toBe(false);
    expect(report.results.find((result: { tool: string }) => result.tool === 'docker-compose')?.status).toBe('not-found');
  });
});
