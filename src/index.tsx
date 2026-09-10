#!/usr/bin/env bun
// index.ts — Bootstrap: TUI or CLI. No business logic here.

import { runCli } from './cli/index.js';

if (process.argv.length <= 2) {
  const { render } = await import('ink');
  const { App } = await import('./tui/app/App.js');
  render(<App />);
} else {
  runCli();
}
