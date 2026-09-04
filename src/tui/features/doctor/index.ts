// index.ts — Public API of the doctor feature slice (FSD rule 4-2).
// External consumers (src/cli/commands/doctor.ts) must import from here,
// never from slice internals. ADR-0014: doctor feature is a sanctioned
// tui→cli boundary exception (`tako doctor` launches the screen from CLI).
// The same screen is embedded by the TUI DoctorPage without exit semantics.

export { runDoctorScreen } from './lib/run.js';
export type { RunDoctorDeps } from './lib/run.js';
export { DoctorScreen } from './ui/DoctorScreen.js';
export type { DoctorScreenProps } from './ui/DoctorScreen.js';
export { formatDoctorText } from './lib/format-text.js';
