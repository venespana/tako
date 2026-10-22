// StatusError.tsx — The status screen's error state: unknown remote or a
// strict refusal (corrupt/partial remote output never renders as data).
// The service's reason lands verbatim; the retry hint lives in the footer.
import { Box, Text } from 'ink';

export interface StatusErrorProps {
  /** The queried remote (meta line). */
  remote: string;
  /** The service's refusal/unknown-remote reason, verbatim. */
  reason: string;
}

export function StatusError({ remote, reason }: StatusErrorProps): React.ReactElement {
  return (
    <Box flexDirection='column' alignItems='flex-start'>
      <Text bold>Status</Text>
      <Text dimColor>{remote}</Text>
      <Text color='red'>✖ Unable to fetch stack status</Text>
      <Text dimColor>{reason}</Text>
      <Text dimColor>Check that the host is reachable, then press r to retry.</Text>
    </Box>
  );
}
