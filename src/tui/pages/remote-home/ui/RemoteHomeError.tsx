// RemoteHomeError.tsx — The hub's error state: unknown remote or a strict
// refusal (corrupt/partial remote output never renders as data). The
// service's reason lands verbatim; this iteration ships no retry binding —
// the shell's back/quit hints stay the only footer.
import { Box, Text } from 'ink';

export interface RemoteHomeErrorProps {
  /** The service's refusal/unknown-remote reason, verbatim. */
  reason: string;
}

export function RemoteHomeError({ reason }: RemoteHomeErrorProps): React.ReactElement {
  return (
    <Box flexDirection='column' alignItems='flex-start'>
      <Text color='red'>✖ Unable to fetch containers</Text>
      <Text dimColor>{reason}</Text>
      <Text dimColor>Check that the host is reachable.</Text>
    </Box>
  );
}
