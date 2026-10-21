// pages/remotes-add/ui/DoneRow.tsx — completed-field summary row of the
// AddRemoteWizard.
import { Text } from 'ink';

// One-line row for a completed field; `value` is resolved at the call site so
// the component can live at module level instead of being recreated per render.
export function DoneRow({ label, value }: { label: string; value: string }) {
  return (
    <Text dimColor>
      {label} {value}
    </Text>
  );
}
