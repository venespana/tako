// doctor-report.ts — Pure formatter for doctor command output
import pc from 'picocolors';

import type { ToolCheckResult } from '../../domains/system/domain/types.js';

export function formatToolLine(result: ToolCheckResult): string {
  if (result.status === 'found') {
    return `${pc.green('✓')} ${result.tool} ${pc.dim(result.version ?? 'unknown version')}`;
  }
  return `${pc.red('✖')} ${result.tool} ${pc.dim('not found')}`;
}
