// DetailPanel.tsx — RIGHT column of the Remote Home screen: the focused
// row's detail panel. Container mode (name, status, compose context, action
// list with per-status labels, in-panel command feedback, hints) and group
// mode (bold name + dim summary — shown while a COLLAPSED group row holds
// the cursor). Also owns the per-status ink palette shared with the screen's
// group list.
import { Box, Text } from 'ink';

import { CursorColumn } from './CursorColumn.js';
import { Divider } from './Divider.js';
import { theme } from '../../../shared/ui/theme.js';
import { containerActionLabel, groupSummary } from '../model/remote-home.js';
import type {
  ContainerAction,
  ContainerCommand,
  ContainerEntry,
  ContainerStatus,
  ServiceGroup,
} from '../model/remote-home.js';

/** Ink color per container status (the pages' established inline palette). */
export const STATUS_COLOR: Record<ContainerStatus, string> = {
  running: 'green',
  exited: 'red',
  paused: 'yellow',
};

interface DetailPanelProps {
  actions: ContainerAction[];
  /** In-panel lifecycle feedback: a dim running line while the command is
   * in flight, the red refusal reason when the remote refused. Container
   * mode only. */
  command?: ContainerCommand;
  /** The focused container's compose project; null → the standalone
   * context. Container mode only. */
  composeProject?: string | null;
  /** The focused container. Exactly one of `container`/`group` is set:
   * container mode renders the full panel, group mode name + summary. */
  container?: ContainerEntry;
  /** The focused group (a collapsed group row holds the cursor): bold name
   * + dim summary, no status row and no ACTIONS section. */
  group?: ServiceGroup;
  focusedActionId: string;
}

/** The compose context line: "proxy (compose)" or "no compose". */
function containerContext(composeProject: string | null): string {
  return composeProject === null ? 'no compose' : `${composeProject} (compose)`;
}

/** RIGHT column: the focused row's detail panel — a container (name,
 * status, compose context, action list, command feedback, hints) or a
 * collapsed group (name + summary). */
export function DetailPanel({
  actions,
  command,
  composeProject,
  container,
  group,
  focusedActionId,
}: DetailPanelProps): React.ReactElement {
  return (
    <Box borderStyle='single' borderColor={theme.disabledColor} flexGrow={1} paddingX={1}>
      <Box flexDirection='column'>
        {container !== undefined ? (
          <>
            <Text bold>{container.name}</Text>
            <Text>
              <Text color={STATUS_COLOR[container.status]}>●</Text>
              {` `}
              <Text color={STATUS_COLOR[container.status]}>{container.status}</Text>
              <Text dimColor>{` · ${containerContext(composeProject ?? null)}`}</Text>
            </Text>
            <Divider />
            <Text dimColor>ACTIONS</Text>

            {actions.map(action => (
              <Box key={action.id} justifyContent='space-between'>
                <Text>
                  <CursorColumn focused={action.id === focusedActionId} />
                  {containerActionLabel(action, container.status)}
                </Text>
                <Text bold dimColor>
                  {action.key}
                </Text>
              </Box>
            ))}

            {command?.phase === 'running' && <Text dimColor>{`${command.verb}ing…`}</Text>}
            {command?.phase === 'error' && <Text color='red'>{command.reason}</Text>}

            <Text dimColor>Start when stopped, restart when running</Text>
          </>
        ) : group !== undefined ? (
          <>
            <Text bold>{group.name}</Text>
            <Text dimColor>{groupSummary(group)}</Text>
          </>
        ) : null}
      </Box>
    </Box>
  );
}
