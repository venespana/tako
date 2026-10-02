// index.ts — Public API of the doctor feature slice (FSD rule 4-2).
// External consumers (src/cli/commands/doctor.ts) must import from here,
// never from slice internals. ADR-0014 sanctioned the cli→tui exception
// (the CLI imports this TUI slice: `tako doctor` renders the screen) —
// transitional until F3, superseded by ADR-0019. The same screen is
// embedded by the TUI DoctorPage without exit semantics.

export { DoctorScreen } from './ui/DoctorScreen.js';
export type { DoctorScreenProps } from './ui/DoctorScreen.js';
export { formatDoctorText } from './lib/format-text.js';
