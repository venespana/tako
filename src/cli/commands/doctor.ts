// doctor.ts — CLI endpoint for `tako doctor`
//
// ADR-0019: parse → call the service → print → exit code. The host tool
// check lives in services/system; the text rendering stays a client concern
// (transitional cli→tui import for the doctor formatting slice, per the
// ADR-0014 exceptions pending their ADR-0019 deletion decision).
import { checkHostDependencies } from '../../services/system.js';
import { formatDoctorText } from '../../tui/features/doctor/index.js';

export async function runDoctor(): Promise<number> {
  const result = await checkHostDependencies();

  console.log(formatDoctorText(result));
  return result.allPresent ? 0 : 1;
}
