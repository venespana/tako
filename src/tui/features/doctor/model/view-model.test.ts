// tui/features/doctor/model/view-model.test.ts — vitest unit tests for toMissingOnly + buildDoctorVM
import { describe, it, expect } from 'vitest';
import type { SystemCheckResult, ToolCheckResult } from '../../../../domains/system/domain/types.js';
import { toMissingOnly, buildDoctorVM } from './view-model.js';

describe('toMissingOnly', () => {
  function makeResult(
    ...tools: Array<{ tool: string; status: 'found' | 'not-found'; version: string | null }>
  ): SystemCheckResult {
    const results: ToolCheckResult[] = tools.map(t => ({
      tool: t.tool as ToolCheckResult['tool'],
      status: t.status,
      version: t.version,
    }));
    const allPresent = tools.every(t => t.status === 'found');
    return { results, allPresent };
  }

  it('all satisfied → empty array', () => {
    const result = makeResult(
      { tool: 'ssh', status: 'found', version: '9.0' },
      { tool: 'ssl', status: 'found', version: '3.0.0' },
      { tool: 'git', status: 'found', version: '2.43.0' },
      { tool: 'docker', status: 'found', version: '24.0.0' },
      { tool: 'docker-compose', status: 'found', version: 'v2.24.0' }
    );
    expect(toMissingOnly(result)).toHaveLength(0);
  });

  it('some missing → only not-found tools returned', () => {
    const result = makeResult(
      { tool: 'ssh', status: 'found', version: '9.0' },
      { tool: 'ssl', status: 'found', version: '3.0.0' },
      { tool: 'git', status: 'not-found', version: null },
      { tool: 'docker', status: 'found', version: '24.0.0' },
      { tool: 'docker-compose', status: 'not-found', version: null }
    );
    const missing = toMissingOnly(result);
    expect(missing).toHaveLength(2);
    expect(missing.map(r => r.tool)).toEqual(['git', 'docker-compose']);
    expect(missing[0]?.status).toBe('not-found');
    expect(missing[1]?.status).toBe('not-found');
  });

  it('all missing → all 5 returned in order', () => {
    const result = makeResult(
      { tool: 'ssh', status: 'not-found', version: null },
      { tool: 'ssl', status: 'not-found', version: null },
      { tool: 'git', status: 'not-found', version: null },
      { tool: 'docker', status: 'not-found', version: null },
      { tool: 'docker-compose', status: 'not-found', version: null }
    );
    const missing = toMissingOnly(result);
    expect(missing).toHaveLength(5);
    expect(missing.map(r => r.tool)).toEqual(['ssh', 'ssl', 'git', 'docker', 'docker-compose']);
  });

  it('empty results → empty array', () => {
    const result = makeResult();
    expect(toMissingOnly(result)).toHaveLength(0);
  });

  it('preserves original order of missing tools', () => {
    // Order in the domain is always ssh, ssl, git, docker, docker-compose
    const result = makeResult(
      { tool: 'ssh', status: 'found', version: '9.0' },
      { tool: 'ssl', status: 'not-found', version: null },
      { tool: 'git', status: 'found', version: '2.43.0' },
      { tool: 'docker', status: 'not-found', version: null },
      { tool: 'docker-compose', status: 'found', version: 'v2.24.0' }
    );
    const missing = toMissingOnly(result);
    expect(missing.map(r => r.tool)).toEqual(['ssl', 'docker']);
  });
});

describe('buildDoctorVM', () => {
  function makeResult(allPresent: boolean, ...missingTools: string[]): SystemCheckResult {
    const allTools: Array<'ssh' | 'ssl' | 'git' | 'docker' | 'docker-compose'> = [
      'ssh',
      'ssl',
      'git',
      'docker',
      'docker-compose',
    ];
    const results: ToolCheckResult[] = allTools.map(tool => ({
      tool,
      status: missingTools.includes(tool) ? ('not-found' as const) : ('found' as const),
      version: missingTools.includes(tool) ? null : '1.0.0',
    }));
    return { results, allPresent };
  }

  it('allPresent=true → missing empty array', () => {
    const vm = buildDoctorVM(makeResult(true));
    expect(vm.allPresent).toBe(true);
    expect(vm.missing).toHaveLength(0);
  });

  it('allPresent=false → missing non-empty', () => {
    const vm = buildDoctorVM(makeResult(false, 'docker-compose'));
    expect(vm.allPresent).toBe(false);
    expect(vm.missing.map(r => r.tool)).toEqual(['docker-compose']);
  });
});
