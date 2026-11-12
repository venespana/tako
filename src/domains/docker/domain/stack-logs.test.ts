// stack-logs.test.ts — the stack-name gate and the compose-logs command
// builder (T1-cli-logs). The name is the one piece of caller input in the
// remote command: anything failing the compose-project grammar is refused
// BEFORE any shell string is built, and the builder emits exactly one fixed
// shape per (stack, follow) pair.
import { describe, expect, it } from 'vitest';

import { composeLogsCommand, isValidStackName } from './stack-logs.js';

describe('isValidStackName — the compose-project name grammar', () => {
  it.each(['web', 'media', 'adguard-home', 'kuma_2', 'My.Stack9', 'a'])('accepts the compose-safe name %s', name => {
    expect(isValidStackName(name)).toBe(true);
  });

  it.each(['', '-lead', '.dot', '_under', 'we b', 'web;rm', 'web$x', 'wèb', 'web\n1', "web'd"])(
    'refuses the unsafe stack name %j',
    name => {
      expect(isValidStackName(name)).toBe(false);
    }
  );
});

describe('composeLogsCommand — the one remote command shape', () => {
  it('builds `docker compose -p <stack> logs` without follow', () => {
    expect(composeLogsCommand('media', false)).toBe(`docker compose -p 'media' logs`);
  });

  it('appends -f exactly when follow is requested', () => {
    expect(composeLogsCommand('media', true)).toBe(`docker compose -p 'media' logs -f`);
  });

  it('single-quote-escapes even quote-bearing names (defense in depth behind the gate)', () => {
    expect(composeLogsCommand("a'b", false)).toBe(`docker compose -p 'a'\\''b' logs`);
  });
});
