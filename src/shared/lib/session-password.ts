// session-password.ts — Shared kernel contract for passing a session SSH
// password to the tako CLI's non-interactive runs of the agent commands
// (task 9.18): the value travels in the environment under this name — NEVER
// argv (ps-visible) — and is read only by the CLI credential resolvers
// (agent install/status/uninstall). Since 9.19 the TUI no longer spawns the
// CLI (the install runs in-process and passes the session password as
// connection material directly); the env contract remains for terminal runs.
// The CLI resolvers import this constant so the name cannot drift.
export const SESSION_PASSWORD_ENV = 'TAKO_SSH_PASSWORD';
