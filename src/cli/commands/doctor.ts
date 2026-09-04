// doctor.ts — CLI handler for `tako doctor`
import { LocalHostToolChecker } from '../../domains/system/infrastructure/LocalHostToolChecker.js';
import { CheckHostDependencies } from '../../domains/system/application/CheckHostDependencies.js';
import { formatDoctorText } from '../../tui/features/doctor/index.js';

export async function runDoctor(): Promise<number> {
  const checker = new LocalHostToolChecker();
  const useCase = new CheckHostDependencies(checker);
  const result = await useCase.checkAll();

  console.log(formatDoctorText(result));
  return result.allPresent ? 0 : 1;
}
