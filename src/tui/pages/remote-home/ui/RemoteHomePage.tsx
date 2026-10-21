// RemoteHomePage.tsx — The Home/Remote hub screen (pen frame
// "Screen - Home / Remote"): static tab strip, the service-group list with
// expand glyphs and per-group summaries, and the focused-container detail
// panel with its static action list. Visibility-only iteration — everything
// renders from REMOTE_HOME_FIXTURE (no docker data, no keyboard interaction,
// no tab switching); the static "focus" is derived from the fixture, never
// hardcoded. Logo, active-remote header and footer are app-shell chrome.
import { Box, Text } from 'ink';

import { CursorColumn } from './CursorColumn.js';
import { STATUS_COLOR, DetailPanel } from './DetailPanel.js';
import { Divider } from './Divider.js';
import { groupSummary, REMOTE_HOME_FIXTURE } from '../model/remote-home.js';
import type { ContainerStatus, ServiceGroup } from '../model/remote-home.js';

/** The group's stalled status when its non-running containers all share one
 * status (drives the "0/1 · paused" row suffix); null when everything runs
 * or the stalled statuses differ. */
function stalledStatus(group: ServiceGroup): ContainerStatus | null {
  const stalled = group.containers
    .filter(container => container.status !== 'running')
    .map(container => container.status);
  const first = stalled[0];
  const uniform = stalled.length > 0 && stalled.every(status => status === first);

  return uniform ? (first ?? null) : null;
}

export function RemoteHomePage(): React.ReactElement {
  const { groups, actions, totalContainers, runningContainers } = REMOTE_HOME_FIXTURE;
  const focusedGroup = groups.find(group => group.expanded);
  const focusedContainer = focusedGroup?.containers[0];
  const focusedAction = actions[0];

  return (
    <Box flexDirection='column' alignItems='flex-start' paddingLeft={2}>
      <Box height={2} />

      {/* Tab strip: Servicios active (bold cyan, 2px cyan underline),
          Global actions inactive (dim, dim underline). Switching tabs is a
          later iteration — this row is static. */}
      <Box columnGap={3}>
        <Box flexDirection='column'>
          <Text>
            <Text bold dimColor>
              1
            </Text>
            <Text bold color='cyan'>
              {` Servicios`}
            </Text>
          </Text>
          <Text color='cyan'>{'──'}</Text>
        </Box>
        <Box flexDirection='column'>
          <Text>
            <Text bold dimColor>
              2
            </Text>
            <Text dimColor>{` Global actions`}</Text>
          </Text>
          <Text dimColor>{'──'}</Text>
        </Box>
      </Box>

      <Divider />

      <Box alignSelf='stretch' columnGap={2}>
        {/* LEFT: the service-group list (fixed width). Collapsed groups hide
            their containers; the cursor sits on the first container of the
            first expanded group (static this iteration). */}
        <Box flexDirection='column' width={46}>
          <Box justifyContent='space-between'>
            <Text bold>Servicios</Text>
            <Text dimColor>{`${totalContainers} containers · ${runningContainers} running`}</Text>
          </Box>
          <Divider />

          {groups.map(group => {
            const stalled = stalledStatus(group);

            return (
              <Box key={group.id} flexDirection='column'>
                <Text>
                  <Text dimColor>{group.expanded ? '▼' : '▶'}</Text>
                  {` `}
                  <Text bold>{group.name}</Text>
                  {` `}
                  <Text dimColor>{groupSummary(group)}</Text>
                  {stalled !== null && (
                    <>
                      <Text dimColor>{` · `}</Text>
                      <Text color={STATUS_COLOR[stalled]}>{stalled}</Text>
                    </>
                  )}
                </Text>
                {group.expanded &&
                  group.containers.map((container, index) => (
                    <Text key={container.id}>
                      <CursorColumn focused={group.id === focusedGroup?.id && index === 0} />
                      <Text color={STATUS_COLOR[container.status]}>●</Text>
                      {` ${container.name}`}
                    </Text>
                  ))}
              </Box>
            );
          })}
        </Box>

        {focusedContainer !== undefined && focusedGroup !== undefined && focusedAction !== undefined && (
          <DetailPanel
            actions={actions}
            container={focusedContainer}
            focusedActionId={focusedAction.id}
            group={focusedGroup}
          />
        )}
      </Box>
    </Box>
  );
}
