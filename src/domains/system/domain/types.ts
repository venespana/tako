// domain/types.ts — pure types, zero deps

export type HostTool = 'ssh' | 'ssl' | 'git' | 'docker' | 'docker-compose';
export type CheckStatus = 'found' | 'not-found';

export interface ToolCheckResult {
  readonly tool: HostTool;
  readonly status: CheckStatus;
  readonly version: string | null; // null when not found or version capture failed
}

export interface SystemCheckResult {
  readonly results: readonly ToolCheckResult[];
  readonly allPresent: boolean;
}
