// HostToolChecker.ts — PORT interface (application layer owns this)
import type { HostTool, ToolCheckResult } from '../domain/types.js';

export interface HostToolChecker {
  check(tool: HostTool): Promise<ToolCheckResult>;
}
