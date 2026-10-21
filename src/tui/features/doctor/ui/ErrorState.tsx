// tui/features/doctor/ui/ErrorState.tsx — Error placeholder shown when the
// host-dependency check fails.
import { Box, Text } from 'ink';

export function ErrorState({ error }: { error: unknown }): React.ReactElement {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <Box flexDirection='column' padding={1}>
      <Text color='red'>Error: {message}</Text>
    </Box>
  );
}
