// pages/tasks/ui/JobForm.test.tsx — 9.15b/9.15c: the form follows
// the AddRemoteWizard progressive-disclosure pattern (ONE field at a time, id
// focused on entry, Enter confirms each step, completed fields collapse into
// done rows) and the Esc-only-cancel discipline (character keys are data
// entry only — no char binding may fire while the form is open).
import { describe, expect, it, vi } from 'vitest';

import { render } from 'ink-testing-library';

import type { JobDefinition, PruneScopes } from '../../../../domains/agent/domain/types.js';
import { EMPTY_JOB_FORM, type JobFormValues } from '../model/job-form.js';
import { JobForm } from './JobForm.js';

/** Poll until predicate() holds (Ink stdin flush + re-render settle). */
async function until(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  for (let waited = 0; !predicate() && waited < timeoutMs; waited += 10) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  if (!predicate()) throw new Error('until: condition not met within timeout');
}

/**
 * One React commit after `until`: typing echoes from TextInput's internal
 * state, but our onChange → setValues lands one render later — Enter must
 * never race the values it validates (9.10 lesson).
 */
async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 25));
}

const VALID_LIFECYCLE: JobFormValues = {
  id: 'caddy-restart',
  type: 'stack-lifecycle',
  op: 'restart',
  stackDir: '/srv/stacks/caddy',
  scopes: [],
  cron: '0 4 * * *',
};

describe('JobForm progressive disclosure (9.15b)', () => {
  it('opens with the id field focused and every later field hidden', () => {
    const onSubmit = vi.fn();
    const { lastFrame, unmount } = render(
      <JobForm initial={EMPTY_JOB_FORM} onCancel={() => {}} onSubmit={onSubmit} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('New job');
    expect(frame).toContain('Job id');
    expect(frame).not.toContain('Job type');
    expect(frame).not.toContain('Prune scopes');
    expect(frame).not.toContain('Schedule');
    unmount();
  });

  it('walks id → type → scopes → schedule, one field at a time, and submits the built job', async () => {
    const onSubmit = vi.fn();
    const instance = render(<JobForm initial={EMPTY_JOB_FORM} onCancel={() => {}} onSubmit={onSubmit} />);

    instance.stdin.write('nightly-prune');
    await until(() => (instance.lastFrame() ?? '').includes('nightly-prune'));
    await settle();
    instance.stdin.write('\r'); // confirm id
    await until(() => (instance.lastFrame() ?? '').includes('Job type'));
    await settle();
    let frame = instance.lastFrame() ?? '';
    expect(frame).toContain('nightly-prune'); // completed field collapsed to a done row
    expect(frame).toContain('Job type');
    expect(frame).not.toContain('Prune scopes'); // later fields stay hidden
    expect(frame).not.toContain('Schedule');

    instance.stdin.write('\r'); // commit the highlighted type (prune)
    await until(() => (instance.lastFrame() ?? '').includes('Prune scopes'));
    await settle();
    frame = instance.lastFrame() ?? '';
    expect(frame).toContain('prune'); // type done row
    expect(frame).toContain('stopped containers');
    expect(frame).not.toContain('Schedule');

    instance.stdin.write(' '); // toggle the focused scope (stopped containers)
    await settle(); // the toggle lands in our values before Enter validates them
    instance.stdin.write('\r'); // confirm scopes
    await until(() => (instance.lastFrame() ?? '').includes('Schedule'));
    await settle();

    instance.stdin.write('\r'); // cron prefilled (0 4 * * *) — confirm and submit
    await until(() => onSubmit.mock.calls.length > 0);
    expect(onSubmit).toHaveBeenCalledWith({
      id: 'nightly-prune',
      type: 'prune',
      scopes: ['stopped-containers'],
      schedule: { kind: 'cron', expr: '0 4 * * *' },
    } satisfies JobDefinition);
  });

  it('the stack-lifecycle branch reveals op and stack dir instead of scopes', async () => {
    const onSubmit = vi.fn();
    const instance = render(<JobForm initial={EMPTY_JOB_FORM} onCancel={() => {}} onSubmit={onSubmit} />);

    instance.stdin.write('caddy-restart');
    await until(() => (instance.lastFrame() ?? '').includes('caddy-restart'));
    await settle();
    instance.stdin.write('\r');
    await until(() => (instance.lastFrame() ?? '').includes('Job type'));
    await settle();

    instance.stdin.write('\x1b[B'); // highlight stack-lifecycle
    instance.stdin.write('\r'); // commit the type
    await until(() => (instance.lastFrame() ?? '').includes('Operation'));
    await settle();
    const frame = instance.lastFrame() ?? '';
    expect(frame).toContain('stack-lifecycle');
    expect(frame).not.toContain('Prune scopes'); // the other branch never renders

    instance.stdin.write('\r'); // commit op (restart, prefilled)
    await until(() => (instance.lastFrame() ?? '').includes('stack dir'));
    await settle();

    instance.stdin.write('/srv/stacks/caddy');
    await until(() => (instance.lastFrame() ?? '').includes('/srv/stacks/caddy'));
    await settle();
    instance.stdin.write('\r');
    await until(() => (instance.lastFrame() ?? '').includes('Schedule'));
    await settle();
    instance.stdin.write('\r');

    await until(() => onSubmit.mock.calls.length > 0);
    expect(onSubmit).toHaveBeenCalledWith({
      id: 'caddy-restart',
      type: 'stack-lifecycle',
      op: 'restart',
      stackDir: '/srv/stacks/caddy',
      schedule: { kind: 'cron', expr: '0 4 * * *' },
    } satisfies JobDefinition);
  });

  it('an invalid step cannot be confirmed: bad id stays on the id field', async () => {
    const onSubmit = vi.fn();
    const instance = render(<JobForm initial={EMPTY_JOB_FORM} onCancel={() => {}} onSubmit={onSubmit} />);

    instance.stdin.write('Bad Id!');
    await until(() => (instance.lastFrame() ?? '').includes('Bad Id!'));
    await settle();
    instance.stdin.write('\r'); // refused — the id charset error is on screen
    await new Promise(resolve => setTimeout(resolve, 40));

    expect(instance.lastFrame() ?? '').toContain('Job id');
    expect(instance.lastFrame() ?? '').toContain('lowercase letters');
    expect(instance.lastFrame() ?? '').not.toContain('Job type');
    instance.unmount();
  });

  it('prune scopes refuse to confirm with zero scopes selected', async () => {
    const onSubmit = vi.fn();
    const instance = render(<JobForm initial={EMPTY_JOB_FORM} onCancel={() => {}} onSubmit={onSubmit} />);

    instance.stdin.write('nightly-prune');
    await until(() => (instance.lastFrame() ?? '').includes('nightly-prune'));
    await settle();
    instance.stdin.write('\r');
    await until(() => (instance.lastFrame() ?? '').includes('Job type'));
    await settle();
    instance.stdin.write('\r'); // prune
    await until(() => (instance.lastFrame() ?? '').includes('Prune scopes'));
    await settle();

    instance.stdin.write('\r'); // Enter with NOTHING selected → refused
    await new Promise(resolve => setTimeout(resolve, 40));

    expect(instance.lastFrame() ?? '').toContain('at least one scope');
    expect(instance.lastFrame() ?? '').not.toContain('Schedule');
    expect(onSubmit).not.toHaveBeenCalled();
    instance.unmount();
  });

  it('edit mode opens on the id field with the existing values seeded', () => {
    const { lastFrame, unmount } = render(
      <JobForm initial={VALID_LIFECYCLE} onCancel={() => {}} onSubmit={() => {}} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Edit job caddy-restart');
    expect(frame).toContain('caddy-restart');
    unmount();
  });
});

describe('JobForm Esc-only cancel (9.15c)', () => {
  it('character keys are data entry only — nothing fires, only Esc cancels', async () => {
    const onCancel = vi.fn();
    const onSubmit = vi.fn();
    const instance = render(<JobForm initial={EMPTY_JOB_FORM} onCancel={onCancel} onSubmit={onSubmit} />);

    // Every char that used to be (or could be mistaken for) an action:
    // t/o quick edits, 1-3 scope toggles, plus the page-level d/r/a.
    instance.stdin.write('t o');
    instance.stdin.write('1');
    instance.stdin.write('2');
    instance.stdin.write('3');
    instance.stdin.write('dra');
    await new Promise(resolve => setTimeout(resolve, 60));

    const frame = instance.lastFrame() ?? '';
    expect(frame).toContain('t o123dra'); // it ALL landed in the focused id field
    expect(onCancel).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();

    instance.stdin.write('\x1b'); // ONLY Esc cancels
    await until(() => onCancel.mock.calls.length > 0);
    expect(onSubmit).not.toHaveBeenCalled();
    instance.unmount();
  });

  it('Esc cancels from a mid-form step too (not just the first field)', async () => {
    const onCancel = vi.fn();
    const instance = render(<JobForm initial={EMPTY_JOB_FORM} onCancel={onCancel} onSubmit={() => {}} />);

    instance.stdin.write('nightly-prune');
    await until(() => (instance.lastFrame() ?? '').includes('nightly-prune'));
    await settle();
    instance.stdin.write('\r');
    await until(() => (instance.lastFrame() ?? '').includes('Job type'));
    await settle();

    instance.stdin.write('\x1b');
    await until(() => onCancel.mock.calls.length > 0);
    instance.unmount();
  });
});

describe('JobForm type narrowing (compile-time record)', () => {
  it('scope values stay inside the closed PruneScopes union', () => {
    const scopes: PruneScopes[] = ['stopped-containers'];
    expect(scopes).toHaveLength(1);
  });
});
