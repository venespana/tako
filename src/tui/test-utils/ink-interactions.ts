// ink-interactions.ts — Shared ink-testing-library interaction helpers.
// Test infrastructure, outside the FSD layers: not a slice/segment, no
// public API, importable only from test files.
import type { render } from 'ink-testing-library';

type RenderResult = ReturnType<typeof render>;

// CI runners are small shared machines: under full-suite parallel load,
// frames and delayed React 19 passive effects run several times slower than
// locally (VEN-1: a connect-gate test legitimately needed just over 15s on a
// 2-vCPU runner where local runs stay under 2s; every failure was a WAITING
// budget, never an assertion). Every budget below is the CEILING of a
// condition-based wait — the predicate still returns as soon as the expected
// frame is visible, so a bigger ceiling costs nothing while passing — and
// therefore scales by CI_FACTOR: local runs keep fast failure feedback, CI
// gets headroom. Tests import these constants instead of writing bare
// millisecond literals so the policy lives in one place.
export const CI_FACTOR = process.env.CI ? 3 : 1;

// Ink flushes a processed key within ~32ms (frame throttle); anything past
// this means the key was dropped (pre-subscription window) and may be
// retried. Scaled too: a slow-but-delivered key must not be misclassified as
// dropped, or the retry duplicates it (an ACK-per-char input would corrupt).
export const KEY_FLUSH_MS = 350 * CI_FACTOR;

// Default settle ceiling (call sites previously pinned 1000–2000ms —
// exhausted under loaded CI; FU10/VEN-1).
export const DEFAULT_SETTLE_MS = 3000 * CI_FACTOR;

// Connect-gate flows (mount → prompt → ACK-per-char password entry →
// validation → activation) chain many waits: their final settle ceilings
// scale from this base instead of DEFAULT_SETTLE_MS.
export const CONNECT_TIMEOUT_MS = 10_000 * CI_FACTOR;

// Per-test vitest timeout for the heavy suites. Must exceed the sum of the
// test's internal wait ceilings so an exhausted wait surfaces as the wait's
// own stale frame, not as vitest's timeout (15s was exceeded by 6ms in CI).
export const LOAD_TIMEOUT_MS = 30_000 * CI_FACTOR;

export const wait = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms));

/** Poll until predicate(frame) holds or the timeout elapses. */
export async function settle(
  lastFrame: RenderResult['lastFrame'],
  predicate: (frame: string) => boolean,
  timeoutMs: number = DEFAULT_SETTLE_MS
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

/** Toggle-safe key press: a landed space/l-toggle ALWAYS changes the frame
 * (glyph flip or cursor move), so wait for any change as proof of
 * processing and settle on the expected state without writing again —
 * while a frame that never changed proves the key was dropped, making a
 * retry safe. Raw single writes and blind retries (pressAndSettle) are
 * both wrong for toggles: the former flakes on drops, the latter undoes a
 * landed press. */
export async function pressToggle(
  stdin: RenderResult['stdin'],
  lastFrame: RenderResult['lastFrame'],
  key: string,
  expectFrame: (frame: string) => boolean
): Promise<string> {
  /** Polls until the frame moves off `before` (processed key) or the
   * flush window elapses (dropped key). */
  const waitChange = async (before: string, tries: number): Promise<string> => {
    if (tries === 0) return lastFrame() ?? '';

    await wait(10);

    const current = lastFrame() ?? '';

    return current === before ? waitChange(before, tries - 1) : current;
  };

  const attempt = async (round: number): Promise<string> => {
    const before = lastFrame() ?? '';

    if (expectFrame(before)) return before;

    stdin.write(key);

    const current = await waitChange(before, KEY_FLUSH_MS / 10);

    // Processed — settle on the expected state; another write would undo
    // the toggle. Unchanged after the window means dropped: safe to retry.
    if (current !== before) return settle(lastFrame, expectFrame, KEY_FLUSH_MS);

    return round < 2 ? attempt(round + 1) : settle(lastFrame, expectFrame, KEY_FLUSH_MS);
  };

  return attempt(0);
}
