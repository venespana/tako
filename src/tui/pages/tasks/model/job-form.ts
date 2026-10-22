// pages/tasks/model/job-form.ts — create/edit job form model
// (tasks 8.5; design §TUI Layout: the form covers stack-lifecycle and prune).
//
// The CLOSED job taxonomy drives the form (spec agent-jobs#Safe-Prune-Jobs:
// enforcement MUST NOT depend on the UI): forbidden scopes (volume prune,
// all-images) are not validated away — they are UNREPRESENTABLE, because the
// scope state only ever holds members of the PruneScopes union and the option
// list is exactly the three safe scopes. server-config is likewise not
// form-offered (declared stub; runs always end 'unsupported').
//
// Validation mirrors the agent domain guards client-side so feedback is
// instant: Slug charset for the id, the stackDir guard, and the domain cron
// validator. buildJobDefinition produces the exact union member or nothing.
import { SLUG_PATTERN, isValidCronExpr, isValidStackDir } from '../../../../services/agent.js';
import type { StackLifecycleOp, PruneScopes, Schedule, JobDefinition } from '../../../../services/agent.js';

/** The form covers the two executable job types only (8.5). */
export type JobFormType = 'stack-lifecycle' | 'prune';

export interface JobFormValues {
  readonly id: string;
  readonly type: JobFormType;
  /** stack-lifecycle op (ignored for prune). */
  readonly op: StackLifecycleOp;
  /** Compose stack directory (stack-lifecycle only). */
  readonly stackDir: string;
  /** Closed-union prune scopes (prune only). */
  readonly scopes: PruneScopes[];
  /** Raw cron expression text (validated on submit and per keystroke). */
  readonly cron: string;
}

export interface JobFormErrors {
  readonly id?: string;
  readonly stackDir?: string;
  readonly scopes?: string;
  readonly cron?: string;
}

export const LIFECYCLE_OP_OPTIONS: readonly { readonly value: StackLifecycleOp; readonly label: string }[] = [
  { value: 'up', label: 'up (start/refresh the stack)' },
  { value: 'down', label: 'down (stop the stack)' },
  { value: 'pull', label: 'pull (refresh images)' },
  { value: 'restart', label: 'restart (restart services)' },
];

/**
 * EXACTLY the three ADR-0008-safe scopes. This list IS the closed union made
 * visible: there is no input path for anything else (spec: forbidden scopes
 * invisible/unrepresentable).
 */
export const SCOPE_OPTIONS: readonly { readonly value: PruneScopes; readonly label: string }[] = [
  { value: 'stopped-containers', label: 'stopped containers' },
  { value: 'dangling-images', label: 'dangling images' },
  { value: 'build-cache', label: 'build cache' },
];

export const EMPTY_JOB_FORM: JobFormValues = {
  id: '',
  type: 'prune',
  op: 'restart',
  stackDir: '',
  scopes: [],
  cron: '0 4 * * *',
};

/** Toggle a scope in/out; the parameter type makes foreign scopes inexpressible. */
export function toggleScope(scopes: readonly PruneScopes[], scope: PruneScopes): PruneScopes[] {
  return scopes.includes(scope) ? scopes.filter(value => value !== scope) : [...scopes, scope];
}

/** Client-side validation mirroring the agent domain guards. */
export function validateJobForm(values: JobFormValues): JobFormErrors {
  const errors: { id?: string; stackDir?: string; scopes?: string; cron?: string } = {};

  if (!SLUG_PATTERN.test(values.id.trim())) {
    errors.id = 'use lowercase letters, digits and inner dashes (e.g. nightly-prune)';
  }

  if (values.type === 'stack-lifecycle' && !isValidStackDir(values.stackDir)) {
    errors.stackDir = 'absolute path to the compose stack directory is required';
  }

  if (values.type === 'prune' && values.scopes.length === 0) {
    errors.scopes = 'pick at least one scope';
  }

  const expr = values.cron.trim();

  if (expr === '' || !isValidCronExpr(expr)) {
    errors.cron = 'five-field cron expression required (e.g. "0 4 * * *")';
  }

  return errors;
}

/** Build the exact JobDefinition union member; null when the form is invalid. */
export function buildJobDefinition(values: JobFormValues): JobDefinition | null {
  if (Object.keys(validateJobForm(values)).length > 0) return null;

  const schedule: Schedule = { kind: 'cron', expr: values.cron.trim() };

  if (values.type === 'prune') {
    return { id: values.id.trim(), type: 'prune', scopes: [...values.scopes], schedule };
  }

  return {
    id: values.id.trim(),
    type: 'stack-lifecycle',
    op: values.op,
    stackDir: values.stackDir.trim(),
    schedule,
  };
}

/** Edit path: map an existing job back into form values (schedule editing). */
export function jobToForm(job: JobDefinition): JobFormValues {
  return {
    id: job.id,
    type: job.type === 'prune' ? 'prune' : 'stack-lifecycle',
    op: job.type === 'stack-lifecycle' ? job.op : EMPTY_JOB_FORM.op,
    stackDir: job.type === 'stack-lifecycle' ? job.stackDir : '',
    scopes: job.type === 'prune' ? [...job.scopes] : [],
    cron: job.schedule.expr,
  };
}
