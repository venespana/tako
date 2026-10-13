// index.ts — Public API of the doctor feature slice (FSD rule 4-2).
// ADR-0020: the CLI owns its own text formatting (cli/commands/doctor.ts);
// this slice exposes only what the TUI DoctorPage embeds.

export { DoctorScreen } from './ui/DoctorScreen.js';
