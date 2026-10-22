// ink-interactions.ts — Shared ink-testing-library interaction helpers.
// Test infrastructure, outside the FSD layers: not a slice/segment, no
// public API, importable only from test files.
import type { render } from 'ink-testing-library';

type RenderResult = ReturnType<typeof render>;

// Ink flushes a processed key within ~32ms (frame throttle); anything past
// this means the key was dropped (pre-subscription window) and may be retried.
export const KEY_FLUSH_MS = 350;

export const wait = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms));

/** Poll until predicate(frame) holds or the timeout elapses. */
export async function settle(
  lastFrame: RenderResult['lastFrame'],
  predicate: (frame: string) => boolean,
  timeoutMs: number
): Promise<string> {
  let frame = lastFrame() ?? '';
  let waited = 0;

  while (!predicate(frame) && waited < timeoutMs) {
    await wait(10);
    frame = lastFrame() ?? '';
    waited += 10;
  }

  return frame;
}

/** Write a key, waiting until the expected frame change is visible. A single
 * retry covers keys dropped before a freshly mounted page's Ink useInput
 * effect subscribes (React 19 delays passive effects under load, so the first
 * frame can paint before key handlers are attached). Only use with
 * idempotent-in-context keys (navigation targets, no exit). */
export async function pressAndSettle(
  stdin: RenderResult['stdin'],
  lastFrame: RenderResult['lastFrame'],
  key: string,
  expectFrame: (frame: string) => boolean
): Promise<string> {
  let frame = '';
  let attempt = 0;

  while (attempt < 2 && !expectFrame(frame)) {
    stdin.write(key);
    frame = await settle(lastFrame, expectFrame, KEY_FLUSH_MS);
    attempt++;
  }

  return frame;
}
