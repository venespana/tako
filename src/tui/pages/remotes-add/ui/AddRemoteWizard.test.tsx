// pages/remotes-add/ui/AddRemoteWizard.test.tsx — Component tests for the
// absorbed add-remote wizard. Per ADR-0019 §7 the wizard consumes
// services/remotes directly, so these tests MOCK the service module instead
// of injecting a use case fake. Behavioral coverage kept from the former
// features slice: smoke render, 9.10 stable-typing regression, blocking
// outcomes, type-step semantics, hostkey accept/decline, Tab/Shift+Tab.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

import { render as renderInk } from 'ink-testing-library';

import type { AddRemoteResult } from '../../../../services/remotes.js';
import { addRemote, confirmAddRemote } from '../../../../services/remotes.js';
import { AddRemoteWizard } from './AddRemoteWizard.js';
import { useWizardStore } from '../model/wizard-store.js';

vi.mock('../../../../services/remotes.js', async importOriginal => {
  // Spread the REAL module so the re-exported contract types keep working;
  // only the transport-bearing add functions are replaced.
  const actual = await importOriginal<typeof import('../../../../services/remotes.js')>();
  return { ...actual, addRemote: vi.fn(), confirmAddRemote: vi.fn() };
});

const onComplete = vi.fn() as unknown as (result: AddRemoteResult) => void;

// ---------------------------------------------------------------------------
// Component smoke tests
// ---------------------------------------------------------------------------

describe('AddRemoteWizard smoke tests', () => {
  beforeEach(() => {
    useWizardStore.getState().reset();
    vi.clearAllMocks();
  });

  // (a) render shows name prompt
  it('renders name prompt initially', () => {
    // Smoke test — component should render without throwing
    expect(() => {
      const { unmount } = renderInk(React.createElement(AddRemoteWizard, { onComplete }));
      unmount();
    }).not.toThrow();
  });

  // 9.10 regression: typing used to loop "Maximum update depth exceeded"
  // because the inline onChange arrow was re-created every render and
  // @inkjs/ui's TextInput re-runs its onChange effect whenever the handler
  // identity changes. Stable useCallback handlers must keep typing settled
  // (no throw) and Enter must commit the exact typed value exactly once.
  it('9.10: typing settles without looping and Enter commits the value once', async () => {
    const instance = renderInk(React.createElement(AddRemoteWizard, { onComplete }));

    instance.stdin.write('nas');
    await new Promise(resolve => setTimeout(resolve, 60));
    instance.stdin.write('\r');
    await new Promise(resolve => setTimeout(resolve, 60));

    expect(useWizardStore.getState().data.name).toBe('nas');
    instance.unmount();
  });

  // (d) validation-fail → form re-shown with error, no save
  it('validation-fail → onComplete not called, wizard stays in form', async () => {
    vi.mocked(addRemote).mockResolvedValue({ saved: false, reason: 'validation' });

    const { unmount } = renderInk(React.createElement(AddRemoteWizard, { onComplete }));
    // Reaching the validating step requires submitting a credential field
    // (setKeyPath/setPassword) — setType alone only reveals the next field.
    useWizardStore.getState().setType('store');
    useWizardStore.getState().setPassword('pw');

    await vi.waitFor(() => expect(vi.mocked(addRemote)).toHaveBeenCalledTimes(1));
    expect(onComplete).not.toHaveBeenCalled();
    // 'validation' has no dedicated re-show step → the default (host) step
    expect(useWizardStore.getState().step).toBe('host');
    unmount();
  });

  // (f) duplicate → block message, stays in form
  it('duplicate → block message, wizard stays in form', async () => {
    vi.mocked(addRemote).mockResolvedValue({ saved: false, reason: 'duplicate', duplicateKind: 'name' });

    const { lastFrame, unmount } = renderInk(React.createElement(AddRemoteWizard, { onComplete }));
    useWizardStore.getState().setType('store');
    useWizardStore.getState().setPassword('pw');

    await vi.waitFor(() => expect(useWizardStore.getState().errorMessage).toContain('already exists'));
    expect(lastFrame() ?? '').toContain('already exists');
    expect(onComplete).not.toHaveBeenCalled();
    unmount();
  });
});

// ---------------------------------------------------------------------------
// Type-step UI (task 3.6): exactly three options, no save-password screen,
// validate-only copy for interactive
// ---------------------------------------------------------------------------

describe('AddRemoteWizard type step', () => {
  beforeEach(() => {
    useWizardStore.getState().reset();
    vi.clearAllMocks();
  });

  function driveToTypeStep() {
    const store = useWizardStore.getState();
    store.reset();
    store.setName('nas');
    store.setUser('ops');
    store.setHost('10.0.0.5');
    store.setPort(22);
  }

  it('3.6: TypeStep renders exactly three credential options', () => {
    driveToTypeStep();

    const { lastFrame, unmount } = renderInk(<AddRemoteWizard onComplete={onComplete} />);
    const frame = lastFrame() ?? '';

    expect(frame).toContain('Credential type:');
    expect(frame).toContain('Store password (obfuscated)');
    expect(frame).toContain('SSH key');
    expect(frame).toContain('Ask every session — never stored');
    unmount();
  });

  it('3.6: store type advances to password step — no intermediate screen', () => {
    driveToTypeStep();
    useWizardStore.getState().setType('store');

    const { lastFrame, unmount } = renderInk(<AddRemoteWizard onComplete={onComplete} />);
    const frame = lastFrame() ?? '';

    // No "Save password for future sessions?" intermediate screen
    expect(frame).not.toContain('Save password for future sessions?');
    // With progressive disclosure, credential type is visible (step advanced)
    expect(frame).toContain('Credential type:');
    // Password field is visible because type step is complete (step='password')
    expect(frame).toContain('SSH password');
    unmount();
  });

  it('3.6: interactive type shows validate-only copy at password step', () => {
    driveToTypeStep();
    useWizardStore.getState().setType('interactive');

    const { lastFrame, unmount } = renderInk(<AddRemoteWizard onComplete={onComplete} />);
    const frame = lastFrame() ?? '';

    // Progressive disclosure: type step complete, password field visible
    expect(frame).toContain('Credential type:');
    expect(frame).toContain('SSH password');
    expect(frame).toContain('validation only');
    expect(frame).toContain('never saved');
    unmount();
  });

  it('3.6 regression: Enter on Select commits the type and reveals password (no double-commit)', async () => {
    driveToTypeStep();

    const { lastFrame, stdin, unmount } = renderInk(<AddRemoteWizard onComplete={onComplete} />);

    // The Select is active at the type step; Enter selects the focused option
    // ('store'). Regression guard: Enter must be processed ONCE — a global
    // Enter handler used to double-commit and corrupt credentialType to ''.
    stdin.write('\r');
    await delay(50);

    const frame = lastFrame() ?? '';
    expect(useWizardStore.getState().data.credentialType).toBe('store');
    expect(useWizardStore.getState().step).toBe('password');
    expect(frame).toContain('SSH password');
    unmount();
  });

  it('3.6 regression: Esc aborts the wizard with { saved: false, reason: abort }', async () => {
    driveToTypeStep();

    const { stdin, unmount } = renderInk(<AddRemoteWizard onComplete={onComplete} />);

    // EditingGuard blocks the app-level Esc handler while the form is open,
    // so the wizard itself must own Esc — it was a dead key before.
    stdin.write('\x1b');
    await delay(50);

    expect(onComplete).toHaveBeenCalledWith({ saved: false, reason: 'abort' });
    unmount();
  });

  it('3.6 regression: y at hostkey-confirm accepts and completes via confirmAddRemote', async () => {
    driveToTypeStep();
    useWizardStore.getState().validationSuccess('AA:BB:CC', false);
    vi.mocked(confirmAddRemote).mockResolvedValue({ saved: true });

    const { stdin, unmount } = renderInk(<AddRemoteWizard onComplete={onComplete} />);

    expect(useWizardStore.getState().step).toBe('hostkey-confirm');
    stdin.write('y');
    await delay(50);

    expect(useWizardStore.getState().step).toBe('done');
    expect(vi.mocked(confirmAddRemote)).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('3.6 regression: n at hostkey-confirm declines and aborts', async () => {
    driveToTypeStep();
    useWizardStore.getState().validationSuccess('AA:BB:CC', false);

    const { stdin, unmount } = renderInk(<AddRemoteWizard onComplete={onComplete} />);

    stdin.write('n');
    await delay(50);

    expect(onComplete).toHaveBeenCalledWith({ saved: false, reason: 'abort' });
    unmount();
  });

  it('3.6 regression: Shift+Tab conceals the current field and edits the previous one', async () => {
    driveToTypeStep(); // step 'type' → Select active

    const { lastFrame, stdin, unmount } = renderInk(<AddRemoteWizard onComplete={onComplete} />);

    stdin.write('\x1b[Z'); // Shift+Tab
    await delay(50);

    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('Credential type:');
    expect(frame).toContain('SSH port');
    unmount();
  });

  it('3.6 regression: Shift+Tab discards the committed value of the field being left', async () => {
    useWizardStore.getState().reset();
    useWizardStore.getState().setName('nas');
    useWizardStore.getState().setUser('ops');
    useWizardStore.getState().setHost('10.0.0.5');
    useWizardStore.getState().setPort(2222); // step 'type'

    const { lastFrame, stdin, unmount } = renderInk(<AddRemoteWizard onComplete={onComplete} />);

    // Back to port, then back again: leaving port must clear it (default 22)
    // and conceal the row — the stale 2222 must not survive back-navigation.
    stdin.write('\x1b[Z');
    await delay(50);
    stdin.write('\x1b[Z');
    await delay(50);

    const frame = lastFrame() ?? '';
    expect(useWizardStore.getState().data.port).toBe(22);
    expect(frame).not.toContain('SSH port');
    expect(frame).not.toContain('2222');
    expect(frame).toContain('Hostname or IP address');
    unmount();
  });
});

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
