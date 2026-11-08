// RemoteHomeDashboard.tsx — The hub's ok state: the service-group list with
// per-group summaries and health-lit container rows (▼ expanded / ▶
// collapsed, from the effective expanded state), plus the focused row's
// detail panel. Pure renderer — the cursor arrives from the page (its
// useMenuList walks selectableRows: containers of expanded groups plus
// collapsed group rows, the reopen handles); selection itself is
// intentionally inert on container rows (the detail column tracks the
// cursor; toggling is page-owned). While the page is LOCKED onto a
// container (actions pane), that container's NAME renders in the accent
// color and the ACTIONS cursor marks the focused action.
import { Box, Text } from 'ink';

import { CursorColumn } from './CursorColumn.js';
import { STATUS_COLOR, DetailPanel } from './DetailPanel.js';
import { Divider } from './Divider.js';
import { theme } from '../../../shared/ui/theme.js';
import { buildInventoryRows, groupSummary, selectableRows } from '../model/remote-home.js';
import type { ContainerCommand, RemoteHomeView, ServiceGroup } from '../model/remote-home.js';

export interface RemoteHomeDashboardProps {
  /** The grouped view of the fetched containers. */
  view: RemoteHomeView;
  /** Collapsed group ids — the ▼/▶ glyph and the hidden rows follow it. */
  collapsedIds: ReadonlySet<string>;
  /** Page-owned cursor index into the page's selectableRows walk. */
  cursor: number;
  /** The ACTIONS-pane cursor (locked mode); undefined previews the first
   * action, the list-pane behavior. */
  actionCursor?: number;
  /** In-panel lifecycle feedback (running line / refusal reason). */
  command?: ContainerCommand;
  /** The locked container's id: its NAME renders in the accent color while
   * the keyboard lives in the ACTIONS pane. The status dot keeps its own
   * light and the cursor column is unchanged. */
  selectedContainerId?: string;
}

/** The group's approved `· paused` suffix when every non-running container
 * is paused; exited NEVER surfaces at group level (pen correction — the
 * group row shows glyph + name + summary, plus this one suffix at most). */
function uniformPaused(group: ServiceGroup): boolean {
  const nonRunning = group.containers.filter(container => container.status !== 'running');

  return nonRunning.length > 0 && nonRunning.every(container => container.status === 'paused');
}

export function RemoteHomeDashboard({
  view,
  collapsedIds,
  cursor,
  actionCursor,
  command,
  selectedContainerId,
}: RemoteHomeDashboardProps): React.ReactElement {
  // All rows for rendering; the walk for focus — the page filters the SAME
  // builder. An out-of-range cursor (the list shrank) yields undefined →
  // no highlight, no detail. Only a COLLAPSED group row can hold the
  // group-focus slot; it marks in place via its glyph color.
  const rows = buildInventoryRows(view.groups, collapsedIds);
  const walk = selectableRows(view.groups, collapsedIds);
  const focused = walk[cursor];
  const focusedCollapsedGroupId = focused?.kind === 'group' ? focused.group.id : undefined;
  const focusedContainerId = focused?.kind === 'container' ? focused.container.id : undefined;
  const focusedAction = view.actions[actionCursor ?? 0];

  return (
    <Box alignSelf='stretch' columnGap={2}>
      {/* LEFT: the service-group list (fixed width). Expanded group rows are
          headers (NO cursor column — the pen nesting indent lives in the
          container rows); a COLLAPSED row is the selectable handle that
          reopens its group, so it carries the house cursor column like
          containers (the ActionMenu focus language). */}
      <Box flexDirection='column' width={46}>
        <Box justifyContent='space-between'>
          <Text bold>Services</Text>
          <Text dimColor>{`${view.totalContainers} containers · ${view.runningContainers} running`}</Text>
        </Box>
        <Divider />

        {rows.map(row => {
          if (row.kind === 'group') {
            const expanded = row.group.expanded && !collapsedIds.has(row.group.id);
            const focusedHere = !expanded && focusedCollapsedGroupId === row.group.id;
            const title = (
              <>
                <Text bold>{row.group.name}</Text>
                {` `}
                <Text dimColor>{groupSummary(row.group)}</Text>
              </>
            );
            const pausedSuffix = uniformPaused(row.group) ? (
              <>
                <Text dimColor>{' · '}</Text>
                <Text color={STATUS_COLOR.paused}>paused</Text>
              </>
            ) : null;

            // ALL group rows start at column 0 with their glyph — no cursor
            // column, ever, so expanding/collapsing never shifts layout. A
            // collapsed row marks focus IN PLACE: its glyph turns cursor-
            // cyan (the detail column switching to the group is the other
            // half of the signal); unfocused stays dim.
            return expanded ? (
              <Text key={row.group.id}>
                <Text dimColor>▼</Text>
                {` `}
                {title}
                {pausedSuffix}
              </Text>
            ) : (
              <Text key={row.group.id}>
                <Text dimColor={!focusedHere} color={focusedHere ? theme.cursorColor : undefined}>
                  ▶
                </Text>
                {` `}
                {title}
                {pausedSuffix}
              </Text>
            );
          }

          return (
            <Text key={row.container.id}>
              <CursorColumn focused={focusedContainerId === row.container.id} />
              <Text color={STATUS_COLOR[row.container.status]}>●</Text>
              {` `}
              <Text color={row.container.id === selectedContainerId ? theme.cursorColor : undefined}>
                {row.container.name}
              </Text>
            </Text>
          );
        })}
      </Box>

      {focused?.kind === 'group' && <DetailPanel actions={view.actions} focusedActionId='' group={focused.group} />}
      {focused?.kind === 'container' && focusedAction !== undefined && (
        <DetailPanel
          actions={view.actions}
          command={command}
          composeProject={focused.group.composeProject}
          container={focused.container}
          focusedActionId={focusedAction.id}
        />
      )}
    </Box>
  );
}
