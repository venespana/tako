// features/tasks/job-history/index.ts — Public API of the job-history slice.
export { JobHistoryPane } from './ui/JobHistoryPane.js';
export type { JobHistoryPaneProps } from './ui/JobHistoryPane.js';
export { toHistoryRows, formatRunStatus, summarizeRunResult } from './model/job-history.js';
export type { HistoryRow, RunStatusStyle } from './model/job-history.js';
