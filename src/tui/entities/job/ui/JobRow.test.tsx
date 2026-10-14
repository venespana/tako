// entities/job/ui/JobRow.test.tsx — STRICT TDD RED phase (task 8.12)
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';

import { JobRow } from './JobRow.js';
import type { JobDefinition, JobView } from '../../../../services/agent.js';
import { theme } from '../../../shared/ui/theme.js';

const PRUNE_JOB: JobDefinition = {
  id: 'nas-prune',
  type: 'prune',
  scopes: ['dangling-images', 'build-cache'],
  schedule: { kind: 'cron', expr: '0 4 * * *' },
};

function view(job: JobDefinition, enabled = true): JobView {
  return { job, enabled, createdAt: '2026-09-18T08:00:00.000Z', updatedAt: '2026-09-18T08:00:00.000Z' };
}

describe('JobRow (8.12)', () => {
  it('renders the job id, type, scope detail and schedule on one line', () => {
    const { lastFrame } = render(<JobRow job={view(PRUNE_JOB)} focused={false} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('nas-prune');
    expect(frame).toContain('prune');
    expect(frame).toContain('dangling-images');
    expect(frame).toContain('build-cache');
    expect(frame).toContain('0 4 * * *');
  });

  it('a lifecycle job renders its op and stackDir', () => {
    const { lastFrame } = render(
      <JobRow
        job={view({
          id: 'caddy-pull',
          type: 'stack-lifecycle',
          op: 'pull',
          stackDir: '/srv/stacks/caddy',
          schedule: { kind: 'cron', expr: '30 3 * * 0' },
        })}
        focused={false}
      />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('pull');
    expect(frame).toContain('/srv/stacks/caddy');
  });

  it('the focused row is marked with the theme cursor glyph', () => {
    const focused = render(<JobRow job={view(PRUNE_JOB)} focused={true} />);
    expect(focused.lastFrame() ?? '').toContain(theme.cursorGlyph);
    const idle = render(<JobRow job={view(PRUNE_JOB)} focused={false} />);
    expect(idle.lastFrame() ?? '').not.toContain(theme.cursorGlyph);
  });

  it('a paused job is marked paused', () => {
    const { lastFrame } = render(<JobRow job={view(PRUNE_JOB, false)} focused={false} />);
    expect(lastFrame() ?? '').toContain('paused');
  });
});
