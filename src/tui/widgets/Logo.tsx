// Logo.tsx — Centered ASCII logo for the TUI home screen.
import { Text } from 'ink';

// Simple, narrow ASCII art suitable for terminals
const ASCII_LOGO = `
  ██████╗ ██████╗ ███╗   ██╗
  ██╔══██╗██╔══██╗████╗  ██║
  ██████╔╝██████╔╝██╔██╗ ██║
  ██╔══██╗██╔══██╗██║╚██╗██║
  ██████╔╝██║  ██║██║ ╚████║
  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝
`.trim();

export function Logo() {
  return <Text dimColor={false}>{ASCII_LOGO}</Text>;
}
