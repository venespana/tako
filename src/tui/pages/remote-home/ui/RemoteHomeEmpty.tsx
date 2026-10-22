// RemoteHomeEmpty.tsx — The hub's empty state: the remote answers but runs
// no containers at all (`docker ps -a` came back empty).
import { Box, Text } from 'ink';

export interface RemoteHomeEmptyProps {
  /** The queried remote (explain line). */
  remote: string;
}

export function RemoteHomeEmpty({ remote }: RemoteHomeEmptyProps): React.ReactElement {
  return (
    <Box flexDirection='column' alignItems='flex-start'>
      <Text dimColor>no containers found on {remote}.</Text>
    </Box>
  );
}
