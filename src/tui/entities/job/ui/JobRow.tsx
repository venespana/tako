// entities/job/ui/JobRow.tsx — One job line in the tasks list (task 8.12).
// Pure renderer: focus and enablement arrive as props; the label derives from
// the agent-domain job type (entities/job/model/job-label).
import { Text } from 'ink';

import type { JobView } from '../../../../services/agent.js';
import { theme } from '../../../shared/ui/theme.js';
import { formatJobDetail, formatSchedule } from '../model/job-label.js';

export interface JobRowProps {
  /** The job projection to render. */
  job: JobView;
  /** Whether this row holds the list cursor. */
  focused: boolean;
}

export function JobRow({ job, focused }: JobRowProps): React.ReactElement {
  return (
    <Text>
      <Text color={focused ? theme.cursorColor : undefined}>{focused ? theme.cursorGlyph : ' '}</Text>
      <Text> </Text>
      <Text bold={focused}>{job.job.id}</Text>
      <Text dimColor> {job.job.type}</Text>
      <Text> · {formatJobDetail(job.job)}</Text>
      <Text dimColor> · {formatSchedule(job.job.schedule)}</Text>
      {!job.enabled && <Text color={theme.disabledColor}> · paused</Text>}
    </Text>
  );
}
