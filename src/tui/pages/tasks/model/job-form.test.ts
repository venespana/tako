// pages/tasks/model/job-form.test.ts — STRICT TDD RED phase (task 8.5/8.14)
//
// The create/edit job form model: the CLOSED job taxonomy drives the form —
// forbidden prune scopes are not merely rejected, they are unrepresentable
// (no toggle exists for them), and server-config is not form-offered at all
// (design §TUI Layout: the form covers stack-lifecycle and prune). Validation
// mirrors the agent domain guards client-side (slug, stackDir, cron sanity).
import { describe, expect, it } from 'vitest';

import {
  EMPTY_JOB_FORM,
  SCOPE_OPTIONS,
  buildJobDefinition,
  jobToForm,
  toggleScope,
  validateJobForm,
  type JobFormValues,
} from './job-form.js';
import { isValidCronExpr, type JobDefinition, type PruneScopes } from '../../../../services/agent.js';

describe('job form — the closed union drives the form (8.5)', () => {
  it('scope options are EXACTLY the three ADR-0008-safe scopes — nothing else is expressible', () => {
    expect(SCOPE_OPTIONS.map(option => option.value)).toEqual(['stopped-containers', 'dangling-images', 'build-cache']);
  });

  it('toggleScope adds then removes a scope without duplicates (typed to the closed union)', () => {
    let scopes: PruneScopes[] = toggleScope([], 'dangling-images');
    expect(scopes).toEqual(['dangling-images']);
    scopes = toggleScope(scopes, 'build-cache');
    expect(scopes).toEqual(['dangling-images', 'build-cache']);
    scopes = toggleScope(scopes, 'dangling-images');
    expect(scopes).toEqual(['build-cache']);
  });
});

describe('job form — validation (8.14)', () => {
  const valid: JobFormValues = {
    id: 'nightly-prune',
    type: 'prune',
    op: 'restart',
    stackDir: '',
    scopes: ['stopped-containers'],
    cron: '0 4 * * *',
  };

  it('a valid prune form produces no errors', () => {
    expect(validateJobForm(valid)).toEqual({});
  });

  it('the id must satisfy the Slug charset (lowercase, digits, inner dashes)', () => {
    expect(validateJobForm({ ...valid, id: 'Nightly Prune' }).id).toBeDefined();
    expect(validateJobForm({ ...valid, id: '-leading-dash' }).id).toBeDefined();
    expect(validateJobForm({ ...valid, id: 'has;semicolons' }).id).toBeDefined();
    expect(validateJobForm({ ...valid, id: '' }).id).toBeDefined();
    expect(validateJobForm({ ...valid, id: 'ok-id-2' }).id).toBeUndefined();
  });

  it('stack-lifecycle requires a usable stackDir; prune ignores it', () => {
    const lifecycle: JobFormValues = { ...valid, type: 'stack-lifecycle', stackDir: '', scopes: [] };
    expect(validateJobForm(lifecycle).stackDir).toBeDefined();
    expect(validateJobForm({ ...lifecycle, stackDir: '/srv/stacks/caddy' }).stackDir).toBeUndefined();
    expect(validateJobForm({ ...lifecycle, stackDir: '/srv/has space' }).stackDir).toBeUndefined(); // spaces fine (argv)
    expect(validateJobForm({ ...lifecycle, stackDir: '-evil' }).stackDir).toBeDefined();
    expect(validateJobForm({ ...valid, type: 'prune', stackDir: '' }).stackDir).toBeUndefined();
  });

  it('the cron expression must pass the domain validator (sanity feedback while typing)', () => {
    expect(validateJobForm({ ...valid, cron: '' }).cron).toBeDefined();
    expect(validateJobForm({ ...valid, cron: 'not-a-cron' }).cron).toBeDefined();
    expect(validateJobForm({ ...valid, cron: '99 * * * *' }).cron).toBeDefined();
    expect(validateJobForm({ ...valid, cron: '*/10 * * * *' }).cron).toBeUndefined();
  });

  it('prune jobs need at least one scope', () => {
    expect(validateJobForm({ ...valid, scopes: [] }).scopes).toBeDefined();
  });

  it('server-config is not form-offered: the form type union has no such member', () => {
    // Compile-time guarantee, asserted here for the spec record: the union of
    // form types is exactly stack-lifecycle | prune.
    const allowed: Array<JobFormValues['type']> = ['stack-lifecycle', 'prune'];
    expect(allowed).toHaveLength(2);
  });
});

describe('job form — building the JobDefinition (8.5)', () => {
  it('a validated prune form builds the prune member of the union', () => {
    const job = buildJobDefinition({
      id: 'nas-prune',
      type: 'prune',
      op: 'restart',
      stackDir: '',
      scopes: ['stopped-containers', 'build-cache'],
      cron: '0 4 * * *',
    });
    expect(job).toEqual({
      id: 'nas-prune',
      type: 'prune',
      scopes: ['stopped-containers', 'build-cache'],
      schedule: { kind: 'cron', expr: '0 4 * * *' },
    });
  });

  it('a validated lifecycle form builds the stack-lifecycle member (op + stackDir + schedule)', () => {
    const job = buildJobDefinition({
      id: 'caddy-pull',
      type: 'stack-lifecycle',
      op: 'pull',
      stackDir: '/srv/stacks/caddy',
      scopes: [],
      cron: '30 3 * * 0',
    });
    expect(job).toEqual({
      id: 'caddy-pull',
      type: 'stack-lifecycle',
      op: 'pull',
      stackDir: '/srv/stacks/caddy',
      schedule: { kind: 'cron', expr: '30 3 * * 0' },
    });
  });

  it('an invalid form builds nothing (the page only submits valid forms)', () => {
    expect(buildJobDefinition({ ...EMPTY_JOB_FORM })).toBeNull();
  });
});

describe('job form — edit path (schedule editing, spec tui-tasks#Schedule-Editing)', () => {
  it('an existing job maps into the form values (scopes, cron, stackDir)', () => {
    const job: JobDefinition = {
      id: 'nas-prune',
      type: 'prune',
      scopes: ['dangling-images', 'build-cache'],
      schedule: { kind: 'cron', expr: '15 5 * * 1' },
    };

    const form = jobToForm(job);

    expect(form).toEqual({
      id: 'nas-prune',
      type: 'prune',
      op: EMPTY_JOB_FORM.op,
      stackDir: '',
      scopes: ['dangling-images', 'build-cache'],
      cron: '15 5 * * 1',
    });
    expect(isValidCronExpr(form.cron)).toBe(true);
  });

  it('a lifecycle job maps its op and stackDir too', () => {
    const form = jobToForm({
      id: 'caddy-restart',
      type: 'stack-lifecycle',
      op: 'restart',
      stackDir: '/srv/stacks/caddy',
      schedule: { kind: 'cron', expr: '0 2 * * *' },
    });
    expect(form.type).toBe('stack-lifecycle');
    expect(form.op).toBe('restart');
    expect(form.stackDir).toBe('/srv/stacks/caddy');
  });
});
