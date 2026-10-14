// activate-and-enter.test.ts — 9.14b Select flow: activation enters the
// remote's workspace directly (the remote's menu IS its workspace).
import { describe, expect, it } from 'vitest';

import { activateAndEnterTasks } from './activate-and-enter.js';

describe('activateAndEnterTasks (9.14b)', () => {
  it('activates the remote, then navigates to /tasks — in that order', () => {
    const calls: string[] = [];
    const handler = activateAndEnterTasks({ activateRemote: name => calls.push(`activate:${name}`) }, path =>
      calls.push(`navigate:${path}`)
    );

    handler('nas');

    expect(calls).toEqual(['activate:nas', 'navigate:/tasks']);
  });

  it('passes the interactive connect-time password through to activation', () => {
    const seen: { name: string; password: string | undefined }[] = [];
    const handler = activateAndEnterTasks(
      { activateRemote: (name, password) => seen.push({ name, password }) },
      () => {}
    );

    handler('homeserver', 'secret');

    expect(seen).toEqual([{ name: 'homeserver', password: 'secret' }]);
  });
});
