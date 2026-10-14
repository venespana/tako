// entities/job/index.ts — Public API of the job entity slice (FSD rule 4-2).
// Higher layers import JobRow from here, never from slice internals.
export { JobRow } from './ui/JobRow.js';
export { formatSchedule } from './model/job-label.js';
