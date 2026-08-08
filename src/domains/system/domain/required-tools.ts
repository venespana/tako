// required-tools.ts — domain-owned constant
import type { HostTool } from './types.js';

export const REQUIRED_HOST_TOOLS: readonly HostTool[] = ['ssh', 'ssl', 'git', 'docker', 'docker-compose'] as const;
