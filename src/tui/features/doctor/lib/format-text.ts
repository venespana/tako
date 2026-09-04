// format-text.ts — CLI text formatter for doctor output.
// Renders the healthcheck result in plain text format for non-TTY contexts.
import type { SystemCheckResult } from '../../../../domains/system/domain/types.js';

const TITLE = 'tako doctor - system healthcheck';
const SEPARATOR = '='.repeat(TITLE.length);

const TOOL_LABELS: Record<string, string> = {
  ssh: 'ssh',
  ssl: 'ssl (from ssh)',
  git: 'git',
  docker: 'docker',
  'docker-compose': 'docker compose',
};

function computeStatus(result: SystemCheckResult): {
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

export function formatDoctorText(result: SystemCheckResult): string {
  const lines: string[] = [];
  lines.push(TITLE);
  lines.push(SEPARATOR);
  lines.push('revision de los comandos');
  lines.push('');

  for (const r of result.results) {
    const label = TOOL_LABELS[r.tool] ?? r.tool;
    if (r.status === 'found') {
      const version = r.version ?? 'unknown version';
      lines.push(`  ✓ ${label} ${version}`);
    } else {
      lines.push(`  ✖ ${label} not found`);
    }
  }

  lines.push('');
  const { passed, failed, warnings, status } = computeStatus(result);
  lines.push(`Summary: ${passed} passed, ${failed} failed, ${warnings} warnings`);
  lines.push(`Status: ${status}`);

  return lines.join('\n');
}
