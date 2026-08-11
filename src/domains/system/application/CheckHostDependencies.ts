// CheckHostDependencies.ts — use case (GREEN phase)
import type { HostToolChecker } from './HostToolChecker.js';
import { REQUIRED_HOST_TOOLS } from '../domain/required-tools.js';
import type { SystemCheckResult } from '../domain/types.js';

export class CheckHostDependencies {
  constructor(private readonly checker: HostToolChecker) {}

  async checkAll(): Promise<SystemCheckResult> {
    const results = await Promise.all(REQUIRED_HOST_TOOLS.map(tool => this.checker.check(tool)));

    const allPresent = results.every(r => r.status === 'found');

    return {
      results,
      allPresent,
    };
  }
}
