// StatusLoading.tsx — The status screen's loading state: names the remote
// and shows the fetch in flight on a spinner (the @inkjs/ui Spinner exposes
// no accent-color surface — plain is per design).
import { Box, Text } from 'ink';

import { Spinner } from '@inkjs/ui';

export interface StatusLoadingProps {
  /** The remote being queried (meta + connecting line). */
  remote: string;
}

export function StatusLoading({ remote }: StatusLoadingProps): React.ReactElement {
  return (
    <Box flexDirection='column' alignItems='flex-start'>
      <Text bold>Status</Text>
      <Text dimColor>{remote}</Text>
      <Text dimColor>Connecting to {remote}…</Text>
      <Spinner label='Fetching stack status…' />
    </Box>
  );
}
