#!/usr/bin/env bun
// index.ts — Composition root: bare `tako` → TUI, args → commander CLI.
// This file is the ONLY module allowed to import both `cli/` and `tui/`.
// It sits above both layers and respects the architecture's `cli↔tui` forbidden import rule.

import { runCli } from './cli/index.js';

// Bare `tako` with no arguments → launch TUI
// Any subcommand (e.g. `tako doctor`) → delegate to CLI
if (process.argv.length <= 2) {
  // Dynamic import to avoid pulling Ink/React into CLI-only invocations
  const { render } = await import('ink');
  const { default: App } = await import('./tui/app/App.js');
  const { buildDefaultDispatch } = await import('./tui/features/menu/dispatch/index.js');
  // alternateScreen: render on a separate screen buffer (like vim/htop).
  // No scrollback pollution while running; original terminal content restored on exit.
  const instance = render(<App dispatch={buildDefaultDispatch()} hasActiveRemote={false} />, {
    alternateScreen: true,
  });
  await instance.waitUntilExit();
} else {
  runCli();
}
