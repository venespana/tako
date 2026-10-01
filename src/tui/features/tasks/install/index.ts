// features/tasks/install/index.ts — Public API of the agent-install slice.
export { AgentInstallPanel } from './ui/AgentInstallPanel.js';
export type { AgentInstallPanelProps } from './ui/AgentInstallPanel.js';
export { useAgentInstall } from './model/use-agent-install.js';
export type { InstallOutcome, InstallPhase, InstallRunner } from './model/use-agent-install.js';
