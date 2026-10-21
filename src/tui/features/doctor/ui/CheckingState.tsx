// tui/features/doctor/ui/CheckingState.tsx — Placeholder shown while the
// host-dependency check is running (the screen's idle and checking states).
import { Box, Text } from 'ink';

export function CheckingState(): React.ReactElement {
  return (
    <Box flexDirection='column' padding={1}>
      <Text>Checking host dependencies...</Text>
    </Box>
  );
}
