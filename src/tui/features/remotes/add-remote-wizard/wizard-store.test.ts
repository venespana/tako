// tui/features/remotes/add-remote-wizard/wizard-store.test.ts — Zustand store tests
import { describe, it, expect, beforeEach } from 'vitest';

import { useWizardStore, initialWizardState } from './wizard-store.js';

describe('useWizardStore', () => {
  beforeEach(() => {
    useWizardStore.getState().reset();
  });

  // Step 1: name prompt
  describe('STEP: name', () => {
    it('initial state is name step', () => {
      const state = useWizardStore.getState();
      expect(state.step).toBe('name');
      expect(state.data.name).toBe('');
    });

    it('setName transitions to user step', () => {
      useWizardStore.getState().setName('nas-backup');

      const state = useWizardStore.getState();
      expect(state.step).toBe('user');
      expect(state.data.name).toBe('nas-backup');
    });

    it('empty name is allowed (validation happens later)', () => {
      useWizardStore.getState().setName('');

      const state = useWizardStore.getState();
      expect(state.step).toBe('user');
      expect(state.data.name).toBe('');
    });
  });

  // Step 2: user prompt
  describe('STEP: user', () => {
    beforeEach(() => {
      useWizardStore.getState().setName('nas-backup');
    });

    it('setUser transitions to host step', () => {
      useWizardStore.getState().setUser('ops');

      const state = useWizardStore.getState();
      expect(state.step).toBe('host');
      expect(state.data.username).toBe('ops');
    });
  });

  // Step 3: host prompt
  describe('STEP: host', () => {
    beforeEach(() => {
      const store = useWizardStore.getState();
      store.setName('nas-backup');
      store.setUser('ops');
    });

    it('setHost transitions to port step', () => {
      useWizardStore.getState().setHost('10.0.0.5');

      const state = useWizardStore.getState();
      expect(state.step).toBe('port');
      expect(state.data.host).toBe('10.0.0.5');
    });
  });

  // Step 4: port prompt
  describe('STEP: port', () => {
    beforeEach(() => {
      const store = useWizardStore.getState();
      store.setName('nas-backup');
      store.setUser('ops');
      store.setHost('10.0.0.5');
    });

    it('setPort with non-default port transitions to type step', () => {
      useWizardStore.getState().setPort(2222);

      const state = useWizardStore.getState();
      expect(state.step).toBe('type');
      expect(state.data.port).toBe(2222);
    });

    it('setPort with default port 22 transitions to type step', () => {
      useWizardStore.getState().setPort(22);

      const state = useWizardStore.getState();
      expect(state.step).toBe('type');
      expect(state.data.port).toBe(22);
    });

    it('port defaults to 22 on initial state', () => {
      expect(initialWizardState.data.port).toBe(22);
    });
  });

  // Step 5: type prompt (store | ssh-key)
  describe('STEP: type', () => {
    beforeEach(() => {
      const store = useWizardStore.getState();
      store.setName('nas-backup');
      store.setUser('ops');
      store.setHost('10.0.0.5');
      store.setPort(22);
    });

    it('setType store → transitions to save-password step', () => {
      useWizardStore.getState().setType('store');

      const state = useWizardStore.getState();
      expect(state.step).toBe('save-password');
      expect(state.data.credentialType).toBe('store');
    });

    it('setType ssh-key → transitions to key-path step', () => {
      useWizardStore.getState().setType('ssh-key');

      const state = useWizardStore.getState();
      expect(state.step).toBe('key-path');
      expect(state.data.credentialType).toBe('ssh-key');
    });
  });

  // Step 6a: save-password (store only)
  describe('STEP: save-password', () => {
    beforeEach(() => {
      const store = useWizardStore.getState();
      store.setName('nas-backup');
      store.setUser('ops');
      store.setHost('10.0.0.5');
      store.setPort(22);
      store.setType('store');
    });

    it('setSavePassword true → transitions to password step', () => {
      useWizardStore.getState().setSavePassword(true);

      const state = useWizardStore.getState();
      expect(state.step).toBe('password');
      expect(state.data.savePassword).toBe(true);
    });

    it('setSavePassword false → still goes to password step (transient: needed for session, not persisted)', () => {
      useWizardStore.getState().setSavePassword(false);

      const state = useWizardStore.getState();
      expect(state.step).toBe('password');
      expect(state.data.savePassword).toBe(false);
    });
  });

  // Step 6b: key-path (ssh-key only)
  describe('STEP: key-path', () => {
    beforeEach(() => {
      const store = useWizardStore.getState();
      store.setName('nas-backup');
      store.setUser('ops');
      store.setHost('10.0.0.5');
      store.setPort(22);
      store.setType('ssh-key');
    });

    it('setKeyPath non-empty → transitions to validating', () => {
      useWizardStore.getState().setKeyPath('/home/user/.ssh/id_rsa');

      const state = useWizardStore.getState();
      expect(state.step).toBe('validating');
      expect(state.data.keyPath).toBe('/home/user/.ssh/id_rsa');
    });

    it('setKeyPath empty → defaults to ~/.ssh/id_rsa', () => {
      useWizardStore.getState().setKeyPath('');

      const state = useWizardStore.getState();
      expect(state.step).toBe('validating');
      expect(state.data.keyPath).toBe('~/.ssh/id_rsa');
    });
  });

  // Step 7: password (store + save-password only)
  describe('STEP: password', () => {
    beforeEach(() => {
      const store = useWizardStore.getState();
      store.setName('nas-backup');
      store.setUser('ops');
      store.setHost('10.0.0.5');
      store.setPort(22);
      store.setType('store');
      store.setSavePassword(true);
    });

    it('setPassword non-empty → transitions to validating', () => {
      useWizardStore.getState().setPassword('hunter2');

      const state = useWizardStore.getState();
      expect(state.step).toBe('validating');
      expect(state.data.password).toBe('hunter2');
    });
  });

  // Step 8: validating
  describe('STEP: validating', () => {
    beforeEach(() => {
      const store = useWizardStore.getState();
      store.setName('nas-backup');
      store.setUser('ops');
      store.setHost('10.0.0.5');
      store.setPort(22);
      store.setType('store');
      store.setSavePassword(true);
      store.setPassword('hunter2');
    });

    it('validationSuccess with first-seen host → transitions to hostkey-confirm', () => {
      useWizardStore.getState().validationSuccess('SHA256:abc123', false);

      const state = useWizardStore.getState();
      expect(state.step).toBe('hostkey-confirm');
      expect(state.data.hostkeyFingerprint).toBe('SHA256:abc123');
    });

    it('validationSuccess with known host → transitions to done', () => {
      useWizardStore.getState().validationSuccess('SHA256:abc123', true);

      const state = useWizardStore.getState();
      expect(state.step).toBe('done');
    });

    it('validationFailure → re-shows current step with error message', () => {
      useWizardStore.getState().validationFailure('auth', 'Bad password');

      const state = useWizardStore.getState();
      expect(state.step).toBe('password');
      expect(state.errorMessage).toBe('Bad password');
    });

    it('validationFailure with network error → re-shows host step', () => {
      useWizardStore.getState().validationFailure('network', 'Connection refused');

      const state = useWizardStore.getState();
      expect(state.step).toBe('host');
      expect(state.errorMessage).toBe('Connection refused');
    });
  });

  // Step 9: hostkey-confirm
  describe('STEP: hostkey-confirm', () => {
    beforeEach(() => {
      const store = useWizardStore.getState();
      store.setName('nas-backup');
      store.setUser('ops');
      store.setHost('10.0.0.5');
      store.setPort(22);
      store.setType('store');
      store.setSavePassword(true);
      store.setPassword('hunter2');
      store.validationSuccess('SHA256:abc123', false);
    });

    it('hostkeyAccept → transitions to done', () => {
      useWizardStore.getState().hostkeyAccept();

      expect(useWizardStore.getState().step).toBe('done');
    });

    it('hostkeyDecline → transitions back to type with abort flag', () => {
      useWizardStore.getState().hostkeyDecline();

      const state = useWizardStore.getState();
      expect(state.step).toBe('type');
      expect(state.aborted).toBe(true);
    });
  });

  // Step 10: done
  describe('STEP: done', () => {
    it('done state preserves all collected data', () => {
      const store = useWizardStore.getState();
      store.setName('nas-backup');
      store.setUser('ops');
      store.setHost('10.0.0.5');
      store.setPort(22);
      store.setType('store');
      store.setSavePassword(true);
      store.setPassword('hunter2');
      store.validationSuccess('SHA256:abc123', true);

      const state = useWizardStore.getState();
      expect(state.data.name).toBe('nas-backup');
      expect(state.data.username).toBe('ops');
      expect(state.data.host).toBe('10.0.0.5');
      expect(state.data.port).toBe(22);
      expect(state.data.credentialType).toBe('store');
    });
  });

  // ABORT action (from anywhere)
  describe('ABORT', () => {
    it('abort sets aborted flag and returns to type step', () => {
      const store = useWizardStore.getState();
      store.setName('nas-backup');
      store.setPassword('hunter2');

      useWizardStore.getState().abort();

      const state = useWizardStore.getState();
      expect(state.aborted).toBe(true);
      expect(state.step).toBe('type');
    });
  });

  // Error re-show behavior
  describe('error re-shows current step', () => {
    it('error does not lose previously entered data', () => {
      const store = useWizardStore.getState();
      store.setName('nas-backup');
      store.setUser('ops');
      // Simulate error
      useWizardStore.setState({ errorMessage: 'Connection refused' });

      // Next action clears error
      useWizardStore.getState().setName('nas-backup');

      const state = useWizardStore.getState();
      expect(state.errorMessage).toBeNull();
    });
  });

  // Reset
  describe('reset', () => {
    it('reset returns to initial state', () => {
      const store = useWizardStore.getState();
      store.setName('test');
      store.setUser('ops');

      useWizardStore.getState().reset();

      const state = useWizardStore.getState();
      expect(state.step).toBe('name');
      expect(state.data.name).toBe('');
      expect(state.data.username).toBe('');
    });
  });
});
