// pages/tasks/ui/DoneRow.tsx — completed-step summary row of the job form.
import { Text } from 'ink';

/** One-line row for a completed field (the wizard's DoneRow). */
export function DoneRow({ label, value }: { label: string; value: string }) {
  return (
    <Text dimColor>
      {label} {value}
    </Text>
  );
}
