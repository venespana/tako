// LogsError.tsx — The logs screen's error state (tui-live-logs T2/T4):
// unknown remote, an in-domain refusal or a transport failure — the reason
// lands verbatim, never as fake data. The `r` reconnect binding lives on the
// page; the hint line mirrors StatusError's retry language.
import { Box, Text } from 'ink';

export interface LogsErrorProps {
  /** The acquisition/transport failure reason, verbatim. */
  reason: string;
}

export function LogsError({ reason }: LogsErrorProps): React.ReactElement {
  return (
    <Box flexDirection='column' alignItems='flex-start'>
      <Text color='red'>✖ Unable to stream logs</Text>
      <Text dimColor>{reason}</Text>
      <Text dimColor>Check that the host is reachable, then press r to reconnect.</Text>
    </Box>
  );
}
