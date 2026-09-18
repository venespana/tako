// domain/job.test.ts — STRICT TDD RED phase (tasks 3.1, 3.2, 2.9/3.12)
import { describe, it, expect } from 'vitest';
// RED: import modules that don't exist yet
import {
  isJobDefinition,
  isSlug,
  isValidStackDir,
  parseJobDefinition,
  JobValidationError,
} from './job.js';
import type { JobDefinition } from './types.js';

describe('Slug guard (task 3.1 charset; tasks 2.9 + 3.12 hostile input)', () => {
  it('3.1 RED: accepts lowercase alphanumeric ids with dashes (not leading/trailing rules violated)', () => {
    expect(isSlug('nas-prune')).toBe(true);
    expect(isSlug('a')).toBe(true);
    expect(isSlug('stack-up-2')).toBe(true);
    expect(isSlug('a'.repeat(64))).toBe(true); // max length
  });

  it('3.2 RED: rejects ids that are not shell-safe', () => {
    expect(isSlug('Nas-Prune')).toBe(false); // uppercase
    expect(isSlug('-leading')).toBe(false); // must start alphanumeric
    expect(isSlug('a'.repeat(65))).toBe(false); // too long
    expect(isSlug('')).toBe(false);
    expect(isSlug('nas prune')).toBe(false); // space
    expect(isSlug('nas.dot')).toBe(false); // dot not in charset
    expect(isSlug('naïve')).toBe(false); // non-ASCII
  });

  it('2.9/3.12 RED: remote-shell metacharacters in job ids are rejected', () => {
    expect(isSlug('nas;reboot')).toBe(false); // command separator
    expect(isSlug('$(reboot)')).toBe(false); // command substitution
    expect(isSlug('`reboot`')).toBe(false); // backtick substitution
    expect(isSlug("nas'prune")).toBe(false); // single quote
    expect(isSlug('nas"prune')).toBe(false); // double quote
    expect(isSlug('nas\nreboot')).toBe(false); // newline
    expect(isSlug('nas|reboot')).toBe(false); // pipe
    expect(isSlug('nas&reboot')).toBe(false); // background
    expect(isSlug('nas>reboot')).toBe(false); // redirect
  });

  it('2.9/3.12 RED: assertSlug path rejects hostile ids and names the field', () => {
    expect(() => parseJobDefinition(stackJobSpec({ id: 'nas;reboot' }))).toThrow(JobValidationError);
    try {
      parseJobDefinition(stackJobSpec({ id: '$(rm -rf /)' }));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(JobValidationError);
      expect((error as JobValidationError).reason).toContain('id');
    }
  });
});

describe('stackDir guard (validated before any command assembly — task 2.9)', () => {
  it('3.2 RED: accepts ordinary absolute and relative paths', () => {
    expect(isValidStackDir('/opt/stacks/plex')).toBe(true);
    expect(isValidStackDir('/srv/media-stack_2')).toBe(true);
    expect(isValidStackDir('stacks/plex')).toBe(true);
    expect(isValidStackDir('/opt/dir with space')).toBe(true); // argv-passed, no shell
  });

  it('2.9/3.12 RED: rejects shell metacharacters in paths', () => {
    expect(isValidStackDir('/opt/x;reboot')).toBe(false);
    expect(isValidStackDir('/opt/$(x)')).toBe(false);
    expect(isValidStackDir('/opt/`x`')).toBe(false);
    expect(isValidStackDir("/opt/'x'")).toBe(false);
    expect(isValidStackDir('/opt/"x"')).toBe(false);
    expect(isValidStackDir('/opt/x\ny')).toBe(false); // newline
    expect(isValidStackDir('/opt/x|y')).toBe(false);
    expect(isValidStackDir('/opt/x&y')).toBe(false);
    expect(isValidStackDir('/opt/*')).toBe(false); // glob
    expect(isValidStackDir('/opt/x?y')).toBe(false);
    expect(isValidStackDir('-flag')).toBe(false); // argv flag injection
    expect(isValidStackDir('')).toBe(false);
  });

  it('2.9/3.12 RED: parseJobDefinition rejects hostile stackDir BEFORE returning a job', () => {
    expect(() => parseJobDefinition(stackJobSpec({ stackDir: '/opt/$(reboot)' }))).toThrow(JobValidationError);
    try {
      parseJobDefinition(stackJobSpec({ stackDir: '/opt/x;rm -rf /' }));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(JobValidationError);
      expect((error as JobValidationError).reason).toContain('stackDir');
    }
  });
});

describe('parseJobDefinition — taxonomy guards (tasks 3.1, 3.2)', () => {
  it('3.2 RED: accepts a valid stack-lifecycle job', () => {
    const job = validStackJob();
    expect(job.type).toBe('stack-lifecycle');
    expect(job).toEqual({
      id: 'web-up',
      type: 'stack-lifecycle',
      op: 'restart',
      stackDir: '/opt/stacks/web',
      schedule: { kind: 'cron', expr: '0 4 * * *' },
    });
  });
  it('3.2 RED: accepts a valid prune job with closed-union scopes', () => {
    const job = parseJobDefinition({
      id: 'nas-prune',
      type: 'prune',
      scopes: ['stopped-containers', 'dangling-images', 'build-cache'],
      schedule: { kind: 'cron', expr: '0 3 * * *' },
    });
    expect(job.type).toBe('prune');
  });

  it('3.2 RED: rejects prune scopes outside the closed union (volume prune unrepresentable)', () => {
    expectIsInvalid({
      id: 'bad-prune',
      type: 'prune',
      scopes: ['volumes'],
      schedule: { kind: 'cron', expr: '0 3 * * *' },
    });
    expectIsInvalid({
      id: 'bad-prune',
      type: 'prune',
      scopes: ['dangling-images', 'all-images'],
      schedule: { kind: 'cron', expr: '0 3 * * *' },
    });
  });

  it('3.2 RED: rejects empty prune scopes', () => {
    expectIsInvalid({
      id: 'empty-prune',
      type: 'prune',
      scopes: [],
      schedule: { kind: 'cron', expr: '0 3 * * *' },
    });
  });

  it('3.2 RED: accepts the server-config stub', () => {
    const job = parseJobDefinition({
      id: 'server-audit',
      type: 'server-config',
      schedule: { kind: 'cron', expr: '0 5 * * *' },
    });
    expect(job.type).toBe('server-config');
  });

  it('3.2 RED: rejects unknown job types and missing/wrong fields', () => {
    expectIsInvalid({ id: 'x', type: 'deploy', schedule: { kind: 'cron', expr: '* * * * *' } });
    expectIsInvalid({ type: 'prune', scopes: ['build-cache'], schedule: { kind: 'cron', expr: '* * * * *' } }); // no id
    expectIsInvalid(stackJobSpec({ op: 'destroy' })); // op outside union
    expectIsInvalid(stackJobSpec({ stackDir: 42 })); // wrong type
  });

  it('3.2 RED: schedule must be cron-only (v0) with a syntactically valid expression', () => {
    expectIsInvalid(stackJobSpec({ schedule: { kind: 'once', at: '2026-01-01T00:00:00Z' } }));
    expectIsInvalid(stackJobSpec({ schedule: { kind: 'cron', expr: 'not a cron' } }));
    expectIsInvalid(stackJobSpec({ schedule: { kind: 'cron', expr: '61 * * * *' } }));
    expectIsInvalid(stackJobSpec({ schedule: { kind: 'cron' } })); // missing expr
  });

  it('3.2 RED: isJobDefinition mirrors parseJobDefinition without throwing', () => {
    expect(isJobDefinition(validStackJob())).toBe(true);
    expect(isJobDefinition({ garbage: true })).toBe(false);
    expect(isJobDefinition(null)).toBe(false);
    expect(isJobDefinition('nas-prune')).toBe(false);
  });

  it('3.2 RED: non-object input is rejected, not crashed on', () => {
    expectIsInvalid(undefined);
    expectIsInvalid(42);
    expectIsInvalid([validStackJob()]);
  });
});

// --- helpers -----------------------------------------------------------------

/** Raw (unparsed) stack-lifecycle definition spec for invalid-case tests. */
function stackJobSpec(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'web-up',
    type: 'stack-lifecycle',
    op: 'restart',
    stackDir: '/opt/stacks/web',
    schedule: { kind: 'cron', expr: '0 4 * * *' },
    ...overrides,
  };
}

function validStackJob(): JobDefinition {
  return parseJobDefinition(stackJobSpec());
}

function expectIsInvalid(value: unknown): void {
  let caught: unknown;
  try {
    parseJobDefinition(value);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(JobValidationError);
}
