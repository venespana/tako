// tui/features/doctor/model/view-model.ts — Pure projection: SystemCheckResult → missing-only list
import type { SystemCheckResult, ToolCheckResult } from '../../../../services/system.js';

/**
 * Filter SystemCheckResult.results to only those with status === 'not-found',
 * preserving original order.
 *
 * Empty list means either all tools are present, or there were no results.
 * The caller (DoctorScreen) distinguishes these via result.allPresent.
 */
export function toMissingOnly(result: SystemCheckResult): ToolCheckResult[] {
  return result.results.filter((r: ToolCheckResult) => r.status === 'not-found');
}

/** View model for the DoctorScreen. */
export interface DoctorReportVM {
  readonly missing: readonly ToolCheckResult[];
  readonly allPresent: boolean;
}

/** Build the DoctorReportVM from a SystemCheckResult. */
export function buildDoctorVM(result: SystemCheckResult): DoctorReportVM {
  return {
    missing: toMissingOnly(result),
    allPresent: result.allPresent,
  };
}
