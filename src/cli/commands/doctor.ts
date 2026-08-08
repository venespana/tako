// doctor.ts — CLI handler for `tako doctor`
import { formatToolLine } from './doctor-report.js';
import { CheckHostDependencies } from '../../domains/system/application/CheckHostDependencies.js';
import { LocalHostToolChecker } from '../../domains/system/infrastructure/LocalHostToolChecker.js';

export async function runDoctor(): Promise<number> {
  const checker = new LocalHostToolChecker();
  const useCase = new CheckHostDependencies(checker);

  const result = await useCase.checkAll();

  // Print report lines
  for (const toolResult of result.results) {
    console.log(formatToolLine(toolResult));
  }

  // Summary
  const found = result.results.filter(r => r.status === 'found').length;
  const total = result.results.length;
  console.log(`--- SUMMARY ---`);
  console.log(`${found}/${total} tools found`);

  // Exit code: 0 if all present, 1 if any missing
  return result.allPresent ? 0 : 1;
}
