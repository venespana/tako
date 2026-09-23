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
export type {
  TasksStore,
  TasksState,
  TasksStatus,
  TasksActions,
  TasksAgentInfo,
  TasksGateway,
} from './model/tasks-store.js';
