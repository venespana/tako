// activate-and-enter.test.ts — Approved pen flow ("Screen - Home / Remote"):
// after the Connect gate succeeds, activation enters the remote's hub at
// /remote-home directly. The 9.14b /tasks stopgap is superseded; /tasks
// stays reachable later via the hub's Global actions tab.
import { describe, expect, it } from 'vitest';

import { activateAndEnterRemoteHome } from './activate-and-enter.js';

describe('activateAndEnterRemoteHome', () => {
  it('activates the remote, then navigates to /remote-home — in that order', () => {
    const calls: string[] = [];
    const handler = activateAndEnterRemoteHome({ activateRemote: name => calls.push(`activate:${name}`) }, path =>
      calls.push(`navigate:${path}`)
    );

    handler('nas');

    expect(calls).toEqual(['activate:nas', 'navigate:/remote-home']);
  });

  it('passes the interactive connect-time password through to activation', () => {
    const seen: { name: string; password: string | undefined }[] = [];
    const handler = activateAndEnterRemoteHome(
      { activateRemote: (name, password) => seen.push({ name, password }) },
      () => {}
    );

    handler('homeserver', 'secret');

    expect(seen).toEqual([{ name: 'homeserver', password: 'secret' }]);
  });
});
