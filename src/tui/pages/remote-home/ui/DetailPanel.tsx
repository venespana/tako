// DetailPanel.tsx — RIGHT column of the Remote Home screen: the focused
// container's detail panel (name, status, compose context, static action
// list, hints). Also owns the per-status ink palette shared with the
// screen's group list.
import { Box, Text } from 'ink';

import { CursorColumn } from './CursorColumn.js';
import { Divider } from './Divider.js';
import { theme } from '../../../shared/ui/theme.js';
import type { ContainerAction, ContainerEntry, ContainerStatus, ServiceGroup } from '../model/remote-home.js';

/** Ink color per container status (the pages' established inline palette). */
export const STATUS_COLOR: Record<ContainerStatus, string> = {
  running: 'green',
  exited: 'red',
  paused: 'yellow',
};

interface DetailPanelProps {
  actions: ContainerAction[];
  container: ContainerEntry;
  focusedActionId: string;
  group: ServiceGroup;
}

/** RIGHT column: the focused container's detail panel (name, status,
 * compose context, static action list, hints). */
export function DetailPanel({ actions, container, focusedActionId, group }: DetailPanelProps): React.ReactElement {
  const statusColor = STATUS_COLOR[container.status];
  const context = group.composeProject === null ? group.name : `${group.name} (compose)`;

  return (
    <Box borderStyle='single' borderColor={theme.disabledColor} flexGrow={1} paddingX={1}>
      <Box flexDirection='column'>
        <Text bold>{container.name}</Text>
        <Text>
          <Text color={statusColor}>●</Text>
          {` `}
          <Text color={statusColor}>{container.status}</Text>
          <Text dimColor>{` · ${context}`}</Text>
        </Text>
        <Divider />
        <Text dimColor>ACTIONS</Text>

        {actions.map(action => (
          <Box key={action.id} justifyContent='space-between'>
            <Text>
              <CursorColumn focused={action.id === focusedActionId} />
              {action.label}
            </Text>
            <Text bold dimColor>
              {action.key}
            </Text>
          </Box>
        ))}

        <Text dimColor>Start is available when the container is stopped</Text>
        <Divider />
        <Text dimColor>↑↓ pick a container on the left</Text>
      </Box>
    </Box>
  );
}
