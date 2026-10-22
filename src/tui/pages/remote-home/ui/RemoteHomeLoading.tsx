// RemoteHomeLoading.tsx — The hub's loading state: names the remote and
// shows the fetch in flight on a spinner (the @inkjs/ui Spinner exposes no
// accent-color surface — plain is per design).
import { Box, Text } from 'ink';

import { Spinner } from '@inkjs/ui';

export interface RemoteHomeLoadingProps {
  /** The remote being queried (connecting line). */
  remote: string;
}

export function RemoteHomeLoading({ remote }: RemoteHomeLoadingProps): React.ReactElement {
  return (
    <Box flexDirection='column' alignItems='flex-start'>
      <Text dimColor>Connecting to {remote}…</Text>
      <Spinner label='Fetching containers…' />
    </Box>
  );
}
