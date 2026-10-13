// tui/features/doctor/ui/DoctorScreen.tsx — Shared doctor diagnostic screen.
// Renders identically for CLI (with keypress-wait exit) and TUI (static render).
// Always shows all tools with their status and version.
import { useEffect } from 'react';

import { Box, Text } from 'ink';

import { DoctorToolLine } from './DoctorToolLine.js';
import type { SystemCheckResult } from '../../../../services/system.js';
import { useKeyBindings } from '../../../shared/lib/use-key-bindings.js';
import { useDoctorCheck } from '../model/use-doctor-check.js';

export type DoctorScreenProps = {
  /** Async check function — typically CheckHostDependencies.checkAll(). */
  runCheck: () => Promise<SystemCheckResult>;
  /** Called with the result once the user dismisses the final frame (standalone CLI only). */
  onComplete?: (result: SystemCheckResult) => void;
  /** Called if the check throws (standalone CLI only). */
  onError?: (error: unknown) => void;
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

function StandaloneWaiter({ onConfirm }: { onConfirm: () => void }): React.ReactElement {
  useKeyBindings({ anyKey: onConfirm });
  return <Text dimColor>Press any key to exit</Text>;
}

// ---------------------------------------------------------------------------
// DoctorScreen
// ---------------------------------------------------------------------------

export function DoctorScreen({ runCheck, onComplete, onError }: DoctorScreenProps): React.ReactElement {
  const { status, runCheck: recheck } = useDoctorCheck(runCheck);

  const isStandalone = onComplete !== undefined;

  // Standalone: call onComplete / onError after the screen has rendered the final frame
  useEffect(() => {
    if (!isStandalone) return;
    if (status.status === 'done') {
      onComplete(status.result);
    } else if (status.status === 'error') {
      onError?.(status.error);
    }
  }, [status, isStandalone, onComplete, onError]);

  if (status.status === 'checking' || status.status === 'idle') {
    return <CheckingState />;
  }

  if (status.status === 'error') {
    return (
      <Box flexDirection='column'>
        <ErrorState error={status.error} />
        {isStandalone && <StandaloneWaiter onConfirm={recheck} />}
      </Box>
    );
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
      {isStandalone && <StandaloneWaiter onConfirm={() => onComplete?.(result)} />}
    </Box>
  );
}
