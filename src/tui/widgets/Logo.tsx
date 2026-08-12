// Logo.tsx — Centered ASCII logo for the TUI home screen.
import { Text } from 'ink';

const ASCII_LOGO = `
    ███╗   ██╗███████╗██╗   ██╗██████╗  ██████╗ ██╗   ██╗
    ████╗  ██║██╔════╝██║   ██║██╔══██╗██╔═══██╗╚██╗ ██╔╝
    ██╔██╗ ██║█████╗  ██║   ██║██████╔╝██║   ██║ ╚████╔╝
    ██║╚██╗██║██╔══╝  ██║   ██║██╔══██╗██║   ██║  ╚██╔╝
    ██║ ╚████║███████╗╚██████╔╝██║  ██║╚██████╔╝   ██║
    ╚═╝  ╚═══╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝    ╚═╝
`.trim();

export function Logo() {
  return <Text dimColor={false}>{ASCII_LOGO}</Text>;
}
