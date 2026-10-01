// features/tasks/job-list/index.ts — Public API of the job-list slice.
export { JobListPane } from './ui/JobListPane.js';
export type { JobListPaneProps } from './ui/JobListPane.js';
export {
  useTasksStore,
  resetTasksStoreForTests,
  mergeRuns,
  applyJobStateChanged,
  applyRunCompleted,
  initialTasksState,
} from './model/tasks-store.js';
export {
  assertAgentSocketPresent,
  AgentNotInstalledError,
  resolveAgentSocketPath,
} from './model/agent-socket-probe.js';
export type {
  TasksStore,
  TasksState,
  TasksStatus,
  TasksActions,
  TasksAgentInfo,
  TasksGateway,
  AgentInstallOutcome,
} from './model/tasks-store.js';
