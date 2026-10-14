// stack-dir.test.ts — hostile-input guard for stack directories (tasks 5.3, 5.7)
//
// Threat matrix (remote shell construction): a stackDir travels into compose
// command argvs; these bytes are rejected at the domain guard so no
// downstream assembler ever receives them.
import { describe, expect, it } from 'vitest';

import { StackDirValidationError, assertValidStackDir, isValidStackDir } from './stack-dir.js';

describe('stack-dir — hostile input rejection', () => {
  const hostileCases: readonly unknown[] = [
    'nas;reboot',
    '$(whoami)',
    '`id`',
    'a|b',
    'a&b',
    'a>b',
    'quo"te',
    "quo'te",
    'glob*',
    'brack[et]',
    'brace{1,2}',
    'back\\slash',
    'quest?ion',
    '-leading-dash',
    'new\nline',
    'tab\there',
    '\u0000',
    '..',
    '../escape',
    '/opt/stacks/../elsewhere',
    '',
    42,
    null,
    undefined,
  ];

  it.each(hostileCases)('rejects %j', value => {
    expect(isValidStackDir(value)).toBe(false);
    expect(() => assertValidStackDir(value)).toThrow(StackDirValidationError);
  });

  it('accepts ordinary stack paths (spaces allowed: argv-passed, never shell-interpolated)', () => {
    expect(isValidStackDir('/opt/stacks/plex')).toBe(true);
    expect(isValidStackDir('/srv/homelab media stack')).toBe(true);
    expect(assertValidStackDir('/opt/stacks/plex')).toBe('/opt/stacks/plex');
  });
});
