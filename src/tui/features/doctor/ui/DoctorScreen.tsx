// tui/features/doctor/ui/DoctorScreen.tsx — Shared doctor diagnostic screen.
// Embedded by the TUI DoctorPage (ADR-0020: the CLI formats its own text
// output and never renders this screen). Always shows all tools with their
// status and version.
import { Box, Text } from 'ink';

import { DoctorToolLine } from './DoctorToolLine.js';
import type { SystemCheckResult } from '../../../../services/system.js';
import { useDoctorCheck } from '../model/use-doctor-check.js';

export type DoctorScreenProps = {
  /** Async check function — typically CheckHostDependencies.checkAll(). */
  runCheck: () => Promise<SystemCheckResult>;
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CheckingState(): React.ReactElement {
  return (
    <Box flexDirection='column' padding={1}>
      <Text>Checking host dependencies...</Text>
    </Box>
  );
}

function ErrorState({ error }: { error: unknown }): React.ReactElement {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <Box flexDirection='column' padding={1}>
      <Text color='red'>Error: {message}</Text>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// DoctorScreen
// ---------------------------------------------------------------------------

export function DoctorScreen({ runCheck }: DoctorScreenProps): React.ReactElement {
  const { status } = useDoctorCheck(runCheck);

  if (status.status === 'checking' || status.status === 'idle') {
    return <CheckingState />;
  }

  if (status.status === 'error') {
    return <ErrorState error={status.error} />;
  }

  // status.status === 'done' — show ALL tools with their status
  const { result } = status;

  return (
    <Box flexDirection='column' padding={1}>
      {result.results.map(r => (
        <DoctorToolLine key={r.tool} result={r} />
      ))}
      <Text dimColor>
        {result.results.filter(r => r.status === 'found').length}/{result.results.length} tools found
      </Text>
    </Box>
  );
}
