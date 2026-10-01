// domain/job.ts — taxonomy guards, hostile-input rejection, idempotent identity (tasks 3.2, 2.9)
//
// Every job definition that crosses a trust boundary (protocol payload,
// persisted spec_json) is re-validated HERE before any command can ever be
// assembled from it (threat matrix: remote shell construction). The Slug
// charset and stackDir rejection happen before anything else touches the value.

import { isValidCronExpr } from './schedule.js';
import { SLUG_PATTERN } from './types.js';
import type { JobDefinition, PruneScopes, Schedule, Slug, StackLifecycleOp } from './types.js';

/** Validation failure carrying the offending field in `reason`. */
export class JobValidationError extends Error {
  /** Which field/parts of the definition were rejected. */
  readonly reason: string;

  constructor(reason: string) {
    super(`invalid job definition: ${reason}`);
    this.name = 'JobValidationError';
    this.reason = reason;
  }
}

const STACK_LIFECYCLE_OPS: readonly StackLifecycleOp[] = ['up', 'down', 'pull', 'restart'];

/** Closed prune scope union (ADR-0008): volumes and all-images are unrepresentable. */
const PRUNE_SCOPES: readonly PruneScopes[] = ['stopped-containers', 'dangling-images', 'build-cache'];

/**
 * Shell metacharacters that must NEVER appear in a stackDir. The dir travels
 * into compose command argvs and single-quoted remote shell literals; these
 * bytes are rejected at the domain guard so no downstream assembler ever
 * receives them. Spaces are intentionally allowed (argv-passed, no shell);
 * control characters are rejected via an explicit char-code scan below.
 */
const STACK_DIR_FORBIDDEN = /[`$;&|<>(){}[\]*?!"'\\]/;
/** Leading dash would be parsed as an argv flag by downstream CLIs. */
const STACK_DIR_LEADING_DASH = /^-/;

function hasControlChars(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** True when `value` satisfies the shell-safe Slug charset. */
export function isSlug(value: unknown): value is Slug {
  return typeof value === 'string' && SLUG_PATTERN.test(value);
}

/** Validate an untrusted job id before it can reach persistence or commands.
 *
 * @throws JobValidationError naming the offending value.
 */
export function assertSlug(value: unknown): Slug {
  if (!isSlug(value)) {
    throw new JobValidationError(`job id ${JSON.stringify(value ?? null)} violates the Slug charset`);
  }
  return value;
}

/** True when `dir` is a stack path safe to assemble into commands. */
export function isValidStackDir(dir: unknown): dir is string {
  if (typeof dir !== 'string' || dir.length === 0) return false;
  if (STACK_DIR_LEADING_DASH.test(dir)) return false;
  if (hasControlChars(dir)) return false;
  return !STACK_DIR_FORBIDDEN.test(dir);
}

function isSchedule(value: unknown): value is Schedule {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate['kind'] !== 'cron') return false; // v0 is cron-only; one-shot deferred
  return typeof candidate['expr'] === 'string' && isValidCronExpr(candidate['expr']);
}

/**
 * Validate an untrusted value into a {@link JobDefinition}.
 * Single source of truth for protocol upserts AND persisted spec_json
 * re-validation on load: invalid definitions are rejected, never executed.
 *
 * @throws JobValidationError naming the first offending part.
 */
export function parseJobDefinition(value: unknown): JobDefinition {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new JobValidationError('definition must be a JSON object');
  }
  const candidate = value as Record<string, unknown>;

  if (!isSlug(candidate['id'])) {
    throw new JobValidationError(
      `id ${JSON.stringify(candidate['id'] ?? null)} violates the Slug charset (shell-safe id required)`
    );
  }

  if (!isSchedule(candidate['schedule'])) {
    throw new JobValidationError('schedule must be { kind: "cron", expr } with a valid 5-field cron expression');
  }

  switch (candidate['type']) {
    case 'stack-lifecycle':
      return parseStackLifecycle(candidate['id'], candidate['schedule'], candidate);
    case 'prune':
      return parsePrune(candidate['id'], candidate['schedule'], candidate);
    case 'server-config':
      return { id: candidate['id'], type: 'server-config', schedule: candidate['schedule'] };
    default:
      throw new JobValidationError(`unknown job type ${JSON.stringify(candidate['type'] ?? null)}`);
  }
}

function parseStackLifecycle(id: Slug, schedule: Schedule, candidate: Record<string, unknown>): JobDefinition {
  const op = candidate['op'];
  if (typeof op !== 'string' || !STACK_LIFECYCLE_OPS.includes(op as StackLifecycleOp)) {
    throw new JobValidationError(`op must be one of ${STACK_LIFECYCLE_OPS.join('|')}`);
  }
  const stackDir = candidate['stackDir'];
  if (!isValidStackDir(stackDir)) {
    throw new JobValidationError(
      `stackDir ${JSON.stringify(stackDir ?? null)} contains shell metacharacters or is not a usable path`
    );
  }
  return { id, type: 'stack-lifecycle', op: op as StackLifecycleOp, stackDir, schedule };
}

function parsePrune(id: Slug, schedule: Schedule, candidate: Record<string, unknown>): JobDefinition {
  const scopes = candidate['scopes'];
  if (
    !Array.isArray(scopes) ||
    scopes.length === 0 ||
    !scopes.every(scope => PRUNE_SCOPES.includes(scope as PruneScopes))
  ) {
    throw new JobValidationError(`scopes must be a non-empty subset of ${PRUNE_SCOPES.join('|')}`);
  }
  return { id, type: 'prune', scopes: [...scopes] as PruneScopes[], schedule };
}

/** Non-throwing mirror of {@link parseJobDefinition}. */
export function isJobDefinition(value: unknown): value is JobDefinition {
  try {
    parseJobDefinition(value);
    return true;
  } catch {
    return false;
  }
}

/** True when a job view/definition carries this id — the idempotent identity check. */
export function hasJobId(job: { readonly id: Slug }, id: Slug): boolean {
  return job.id === id;
}
