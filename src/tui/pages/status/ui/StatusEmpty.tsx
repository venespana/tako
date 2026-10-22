// StatusEmpty.tsx — The status screen's empty state: the remote answers but
// runs no compose stacks. Explains what was queried and how to get rows.
import { Box, Text } from 'ink';

export interface StatusEmptyProps {
  /** The queried remote (meta + explain line). */
  remote: string;
}

export function StatusEmpty({ remote }: StatusEmptyProps): React.ReactElement {
  return (
    <Box flexDirection='column' alignItems='flex-start'>
      <Text bold>Status</Text>
      <Text dimColor>{remote} · 0 stacks</Text>
      <Text>no compose stacks found</Text>
      <Text dimColor>docker compose ls returned no stacks on {remote}.</Text>
      <Text dimColor>Deploy a stack on the host, then press r to refresh.</Text>
    </Box>
  );
}
