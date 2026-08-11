// Logo.tsx — ASCII logo for the TUI home screen.
import { Box, Text } from 'ink';

const ASCII_LOGO = `
 █████╗ ██╗   ██╗████████╗ ██████╗ ██████╗ ██╗   ██╗██╗
██╔══██╗██║   ██║╚══██╔══╝██╔═══██╗██╔══██╗╚██╗ ██╔╝██║
███████║██║   ██║   ██║   ██║   ██║██████╔╝ ╚████╔╝ ██║
██╔══██║██║   ██║   ██║   ██║   ██║██╔══██╗  ╚██╔╝  ╚═╝
██║  ██║╚██████╔╝   ██║   ╚██████╔╝██║  ██║   ██║   ██╗
╚═╝  ╚═╝ ╚═════╝    ╚═╝    ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚═╝
`.trim();

export function Logo() {
  return (
    <Box flexDirection='column' alignItems='flex-start'>
      <Text bold color='cyan'>
        {ASCII_LOGO}
      </Text>
    </Box>
  );
}
