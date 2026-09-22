// entities/job/model/job-label.ts — one-line label builders for JobRow (task
// 8.12). Pure: the job type from agent/domain drives what the line shows.
import type { JobDefinition, Schedule } from '../../../../domains/agent/domain/types.js';

/** The middle segment: what this job actually does. */
export function formatJobDetail(job: JobDefinition): string {
  switch (job.type) {
    case 'stack-lifecycle':
      return `${job.op} ${job.stackDir}`;
    case 'prune':
      return job.scopes.join(', ');
    case 'server-config':
      return 'server-config (stub — runs report unsupported)';
  }
}

/** v0 schedules are cron-only (design §Job & Run Model). */
export function formatSchedule(schedule: Schedule): string {
  return `cron ${schedule.expr}`;
}
