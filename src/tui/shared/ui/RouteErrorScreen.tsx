// RouteErrorScreen.tsx — Ink-safe route error boundary screen (task 9.22).
// react-router's DEFAULT error element renders raw text ("Unexpected
// Application Error!"), which crashes Ink with "Text string must be rendered
// inside <Text>". Every route branch declares this screen as its
// errorElement (layout.tsx exports it for the whole branch), so any
// loader/render error renders legibly — and is logged to stderr for
// diagnosis instead of silently masked.
import { useEffect } from 'react';

import { Box, Text } from 'ink';

import { useRouteError } from 'react-router';

export function RouteErrorScreen(): React.ReactElement {
  const error = useRouteError();

  useEffect(() => {
    // Surface the real error on stderr: the on-screen message is the summary,
    // the terminal carries the stack for diagnosis.
    console.error('[tako] route error:', error);
  }, [error]);

  const message = error instanceof Error ? error.message : String(error);

  return (
    <Box flexDirection='column' paddingLeft={2}>
      <Box height={2} />
      <Text color='red'>⚠ route error: {message}</Text>
      <Text dimColor>h/Esc back · q quit — the full stack is on stderr</Text>
    </Box>
  );
}
