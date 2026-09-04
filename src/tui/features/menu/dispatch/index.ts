// dispatch/index.ts — Default dispatch map wiring actions to domain use cases.
// The TUI layer MUST NOT import from src/cli/. Domain use cases are imported directly.

import { CheckHostDependencies } from '../../../../domains/system/application/CheckHostDependencies';
import { LocalHostToolChecker } from '../../../../domains/system/infrastructure/LocalHostToolChecker';
import type { DispatchMap } from '../types.js';

async function runDoctor(): Promise<void> {
  const checker = new LocalHostToolChecker();
  const useCase = new CheckHostDependencies(checker);
  const result = await useCase.checkAll();

  for (const toolResult of result.results) {
    const status = toolResult.status === 'found' ? '✅' : '❌';
    const version = toolResult.version ?? '(not found)';
    console.log(`${status} ${toolResult.tool}: ${version}`);
  }
  const found = result.results.filter(r => r.status === 'found').length;
  const total = result.results.length;
  console.log(`--- ${found}/${total} tools found ---`);
}

export function buildDefaultDispatch(): DispatchMap {
  return {
    doctor: runDoctor,
  };
}
