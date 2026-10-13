// tui/features/doctor/ui/DoctorToolLine.tsx — Single tool status line.
// Shows green check or red X with tool name and version.
import { Text } from 'ink';

import type { ToolCheckResult } from '../../../../services/system.js';

const TOOL_LABELS: Record<string, string> = {
  ssh: 'ssh',
  ssl: 'ssl (from ssh)',
  git: 'git',
  docker: 'docker',
  'docker-compose': 'docker compose',
};

export type DoctorToolLineProps = {
  readonly result: ToolCheckResult;
};

export function DoctorToolLine({ result }: DoctorToolLineProps): React.ReactElement {
  const label = TOOL_LABELS[result.tool] ?? result.tool;

  if (result.status === 'found') {
    return (
      <Text>
        <Text color='green'>✓</Text>
        <Text> {label}</Text>
        <Text dimColor> {result.version ?? 'unknown version'}</Text>
      </Text>
    );
  }

  return (
    <Text>
      <Text color='red'>✖</Text>
      <Text> {label}</Text>
      <Text dimColor> not found</Text>
    </Text>
  );
}
