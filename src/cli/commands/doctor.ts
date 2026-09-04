// doctor.ts — CLI handler for `tako doctor`
import { CheckHostDependencies } from '../../domains/system/application/CheckHostDependencies.js';
import { LocalHostToolChecker } from '../../domains/system/infrastructure/LocalHostToolChecker.js';
import { runDoctorScreen } from '../../tui/features/doctor/index.js';

const TITLE = 'tako doctor - system healthcheck';
const SEPARATOR = '='.repeat(TITLE.length);

const TOOL_LABELS: Record<string, string> = {
  ssh: 'ssh',
  ssl: 'ssl (from ssh)',
  git: 'git',
  docker: 'docker',
  'docker-compose': 'docker compose',
};

function getStatus(result: { results: readonly { tool: string; status: string; version: string | null }[] }): {
  passed: number;
  failed: number;
  warnings: number;
  status: 'Ok' | 'Failed' | 'Degraded';
} {
  const passed = result.results.filter(r => r.status === 'found').length;
  const failed = result.results.filter(r => r.status === 'not-found').length;
  const warnings = result.results.filter(r => r.status === 'found' && !r.version).length;
  let status: 'Ok' | 'Failed' | 'Degraded';
  if (failed === 0) status = 'Ok';
  else if (passed === 0) status = 'Failed';
  else status = 'Degraded';
  return { passed, failed, warnings, status };
}

async function runCli(): Promise<number> {
  const checker = new LocalHostToolChecker();
  const useCase = new CheckHostDependencies(checker);
  const result = await useCase.checkAll();

  console.log(TITLE);
  console.log(SEPARATOR);
  console.log('revision de los comandos');
  console.log('');

  for (const r of result.results) {
    const label = TOOL_LABELS[r.tool] ?? r.tool;
    if (r.status === 'found') {
      const version = r.version ?? 'unknown version';
      console.log(`  ✓ ${label} ${version}`);
    } else {
      console.log(`  ✖ ${label} not found`);
    }
  }

  console.log('');
  const { passed, failed, warnings, status } = getStatus(result);
  console.log(`Summary: ${passed} passed, ${failed} failed, ${warnings} warnings`);
  console.log(`Status: ${status}`);

  return result.allPresent ? 0 : 1;
}

export async function runDoctor(): Promise<number> {
  // Use text output for CLI (non-TTY)
  if (!process.stdout.isTTY) {
    return runCli();
  }

  // Use Ink screen for TTY
  const screenResult = await runDoctorScreen({
    runCheck: () => {
      const checker = new LocalHostToolChecker();
      const useCase = new CheckHostDependencies(checker);
      return useCase.checkAll();
    },
  });

  return screenResult.allPresent ? 0 : 1;
}
