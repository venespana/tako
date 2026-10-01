// testing/InMemoryJobStore.ts — unit-test fixture implementing the JobStore port
//
// NOT production code and NOT imported by any runtime path: this fake fixes
// the CONTRACT semantics every real adapter (SqliteJobStore, WU4) must honor —
// job id as primary key, monotonic run seq, ISO timestamps, idempotent upsert.
import type {
  CreateRunInput,
  JobStore,
  JobUpsertResult,
  RunPatch,
  RunsQuery,
  ScheduleState,
} from '../application/JobStore.js';
import type { JobDefinition, JobView, RunView, Slug } from '../domain/types.js';

export class InMemoryJobStore implements JobStore {
  readonly #jobs = new Map<Slug, JobView>();
  readonly #schedule = new Map<Slug, ScheduleState>();
  readonly #runs = new Map<string, RunView>();
  #nextSeq = 1;
  readonly #nowIso: () => string;

  constructor(nowIso: () => string = () => '2026-01-01T00:00:00.000Z') {
    this.#nowIso = nowIso;
  }

  async listJobs(): Promise<JobView[]> {
    return [...this.#jobs.values()];
  }

  async getJob(id: Slug): Promise<JobView | undefined> {
    return this.#jobs.get(id);
  }

  async upsertJob(job: JobDefinition): Promise<JobUpsertResult> {
    const existing = this.#jobs.get(job.id);
    const now = this.#nowIso();
    const view: JobView = existing
      ? { ...existing, job, enabled: existing.enabled, createdAt: existing.createdAt, updatedAt: now }
      : { job, enabled: true, createdAt: now, updatedAt: now };
    this.#jobs.set(job.id, view);
    return { job: view, created: existing === undefined };
  }

  async deleteJob(id: Slug): Promise<boolean> {
    return this.#jobs.delete(id);
  }

  async getScheduleState(jobId: Slug): Promise<ScheduleState | undefined> {
    return this.#schedule.get(jobId);
  }

  async saveScheduleState(state: ScheduleState): Promise<void> {
    this.#schedule.set(state.jobId, state);
  }

  async createRun(input: CreateRunInput): Promise<RunView> {
    const seq = this.#nextSeq++;
    const run: RunView = {
      seq,
      id: `run-${seq}`,
      jobId: input.jobId,
      mode: input.mode,
      status: 'pending',
      catchup: input.catchup,
      startedAt: input.startedAt,
    };
    this.#runs.set(run.id, run);
    return run;
  }

  async updateRun(runId: string, patch: RunPatch): Promise<RunView | undefined> {
    const current = this.#runs.get(runId);
    if (!current) return undefined;
    const updated: RunView = {
      ...current,
      ...(patch.status !== undefined && { status: patch.status }),
      ...(patch.finishedAt !== undefined && { finishedAt: patch.finishedAt }),
      ...(patch.result !== undefined && { result: patch.result }),
    };
    this.#runs.set(runId, updated);
    return updated;
  }

  async listRuns(query: RunsQuery = {}): Promise<RunView[]> {
    let runs = [...this.#runs.values()].sort((a, b) => a.seq - b.seq);
    if (query.jobId !== undefined) runs = runs.filter(run => run.jobId === query.jobId);
    if (query.sinceSeq !== undefined) runs = runs.filter(run => run.seq > (query.sinceSeq as number));
    if (query.limit !== undefined) runs = runs.slice(0, query.limit);
    return runs;
  }

  async lastSeq(): Promise<number> {
    let max = 0;
    for (const run of this.#runs.values()) {
      if (run.seq > max) max = run.seq;
    }
    return max;
  }
}
