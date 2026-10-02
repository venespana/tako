// AgentInstallPanel.tsx — The "agent not installed" pane of the tasks
// workspace (9.14b; IN-PROCESS since 9.19): installs the agent by calling the
// tasks gateway's install() — the route shim composes the shared agent
// pipeline over the active remote's SSH stack — with progress lines streamed
// live into the pane. The phase state machine lives in the model hook
// (useAgentInstall, 9.16) — this component is its render. On success the
// workspace reconnects (fresh handshake via onInstalled); on failure the
// output stays on screen with r to retry (h/Esc back is the shell's).
// 9.15a: the body carries NO key instructions — the r retry hint is published
// to the footer by the page (single hints writer per page: TasksPage).
import { Box, Text } from 'ink';

import { useAgentInstall, type InstallRunner } from '../model/use-agent-install.js';

const VISIBLE_LINES = 12;

export interface AgentInstallPanelProps {
  readonly remote: string;
  /** The connect failure that led here (kept visible above the output). */
  readonly error: string | null;
  /** Called after a successful install: reconnect the workspace. */
  readonly onInstalled: () => void;
  /** Notified on every install start (auto or retry) — page records the attempt. */
  readonly onStart: () => void;
  /** Auto-run the install once when the panel first appears (first visit). */
  readonly autoStart: boolean;
  /**
   * The gateway-driven install (9.19): runs the agent install IN-PROCESS over
   * the active remote's SSH stack and streams progress lines. Injected by the
   * page from the tasks gateway (features never import app/, and slices never
   * import each other); the session material stays inside the gateway —
   * never env, never argv, never rendered.
   */
  readonly install: InstallRunner;
}

export function AgentInstallPanel({
  remote,
  error,
  onInstalled,
  onStart,
  autoStart,
  install,
}: AgentInstallPanelProps): React.ReactElement {
  const { lines, phase } = useAgentInstall({
    autoStart,
    onInstalled,
    onStart,
    install,
  });

  return (
    <Box flexDirection='column'>
      <Text bold>Agent install on {remote}</Text>
      <Text dimColor>running: agent install {remote}</Text>
      {/* The pre-install connect failure is historical once the install
       * runs: over a successful install it reads as an active error. It
       * stays visible only while idle (autoStart=false remounts). */}
      {error !== null && phase.kind === 'idle' && <Text color='red'>connect failed: {error}</Text>}
      <Box height={1} />
      <Box flexDirection='column' paddingLeft={2}>
        {lines.slice(-VISIBLE_LINES).map(line => (
          <Text key={line.id} dimColor>
            {line.text}
          </Text>
        ))}
        {phase.kind === 'idle' && <Text dimColor>install not started.</Text>}
        {phase.kind === 'running' && <Text>installing…</Text>}
      </Box>
      <Box height={1} />
      {phase.kind === 'done' && phase.outcome.ok && <Text color='green'>install finished — reconnecting…</Text>}
      {phase.kind === 'done' && !phase.outcome.ok && <Text color='red'>install failed ({phase.outcome.error})</Text>}
    </Box>
  );
}
