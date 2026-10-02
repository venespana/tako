// services/system.ts — in-process API over the system domain (ADR-0019).
//
// One complete domain function: the host tool dependency check. The adapter
// choice (the local tool checker) is private wiring written once; the CLI's
// `tako doctor` and any other client consume the typed report.
import { CheckHostDependencies } from '../domains/system/application/CheckHostDependencies.js';
import type { SystemCheckResult } from '../domains/system/domain/types.js';
import { LocalHostToolChecker } from '../domains/system/infrastructure/LocalHostToolChecker.js';

export type { CheckStatus, HostTool, SystemCheckResult, ToolCheckResult } from '../domains/system/domain/types.js';

/** Check every required host tool; the report tells present/missing per tool. */
export function checkHostDependencies(): Promise<SystemCheckResult> {
  return new CheckHostDependencies(new LocalHostToolChecker()).checkAll();
}
