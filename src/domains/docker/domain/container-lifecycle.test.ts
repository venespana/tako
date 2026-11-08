// container-lifecycle.test.ts — pure domain gates for the container
// lifecycle slice (iteration 3 of tui-remote-home-screen): the closed op
// union and docker's container-name grammar. The name gate is the shell
// surface: a name that passes it can never reshape a remote command line
// (no leading dash/dot, no whitespace, no shell metacharacters).
import { describe, expect, it } from 'vitest';

import { CONTAINER_LIFECYCLE_OPS, isContainerLifecycleOp, isValidContainerName } from './container-lifecycle.js';

describe('CONTAINER_LIFECYCLE_OPS — closed union', () => {
  it('admits exactly start and restart, in canonical order', () => {
    expect(CONTAINER_LIFECYCLE_OPS).toEqual(['start', 'restart']);
  });
});

describe('isContainerLifecycleOp', () => {
  it('accepts every union member', () => {
    expect(CONTAINER_LIFECYCLE_OPS.every(op => isContainerLifecycleOp(op))).toBe(true);
  });

  it('refuses stack ops, other container verbs, and non-strings', () => {
    const rejects = ['up', 'down', 'pull', 'stop', 'kill', 'pause', '', 'Start', 42, null, undefined, {}];

    expect(rejects.every(value => !isContainerLifecycleOp(value))).toBe(true);
  });
});

describe('isValidContainerName — docker name grammar', () => {
  it('accepts real-world docker names (dashes, dots, underscores inside)', () => {
    const names = ['web-1', 'app_2.cache-1', 'proxy', 'Ubuntu-22.04_cache.x'];

    expect(names.every(name => isValidContainerName(name))).toBe(true);
  });

  it('refuses anything that could reshape a command line', () => {
    const hostile = [
      '', // empty
      'a', // docker's grammar needs 2+ characters
      '-leading-dash', // option injection
      '.leading-dot', // hidden/relative path look-alike
      'has space',
      'semi;colon',
      'sub$(whoami)',
      'back`tick',
      'pipe|x',
      'quote"double',
    ];

    expect(hostile.every(name => !isValidContainerName(name))).toBe(true);
  });
});
