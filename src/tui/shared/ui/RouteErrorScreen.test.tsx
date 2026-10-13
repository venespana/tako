// RouteErrorScreen.test.tsx — Render smoke test for the Ink-safe route error
// boundary (9.22): the error message must render inside <Text> (react-router's
// DEFAULT error element renders raw text, which crashes Ink) and the raw error
// must reach console.error for stderr diagnosis. useRouteError is stubbed so
// the screen is exercised against both shapes it can receive: Error instances
// and arbitrary thrown values (useRouteError returns unknown).
import { render } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { RouteErrorScreen } from './RouteErrorScreen.js';
import { settle } from '../../test-utils/ink-interactions.js';

// Hoisted so the vi.mock factory can read it before module body evaluation;
// mutable so each case can stub a different error shape.
const stub = vi.hoisted(() => ({ error: new Error('loader exploded') as unknown }));

vi.mock('react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, useRouteError: () => stub.error };
});

describe('RouteErrorScreen', () => {
  let consoleError: MockInstance;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('renders the error message inside the screen and logs the error', async () => {
    const { lastFrame } = render(<RouteErrorScreen />);

    const frame = await settle(lastFrame, f => f.includes('loader exploded'), 1000);

    expect(frame).toContain('route error: loader exploded');
    expect(frame).toContain('the full stack is on stderr');
    // The effect log is the stderr contract: the terminal carries the stack.
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith('[tako] route error:', stub.error));
  });

  it('renders a non-Error thrown value without crashing', async () => {
    stub.error = 'gateway timed out';
    const { lastFrame } = render(<RouteErrorScreen />);

    const frame = await settle(lastFrame, f => f.includes('gateway timed out'), 1000);

    expect(frame).toContain('route error: gateway timed out');
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith('[tako] route error:', 'gateway timed out'));
  });
});
