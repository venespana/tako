// tui/features/remotes/add-remote-wizard/model/wizard-store.ts — Zustand store for wizard
import { create } from 'zustand';

import type { SshCredentialType } from '../../../../../domains/remotes/domain/types.js';

// ---------------------------------------------------------------------------
// Wizard step union
// ---------------------------------------------------------------------------

export type WizardStep =
  | 'name' // Connection name
  | 'user' // Username
  | 'host' // Hostname/IP
  | 'port' // SSH port (default 22)
  | 'type' // Credential type: store | ssh-key
  | 'save-password' // (store only) Ask to save password
  | 'key-path' // (ssh-key only) Path to private key
  | 'password' // (store + save-password) The password itself
  | 'validating' // SSH validation in progress
  | 'hostkey-confirm' // Show fingerprint, require accept
  | 'done'; // Complete

// ---------------------------------------------------------------------------
// Collected wizard data (maps to RemoteDraft)
// ---------------------------------------------------------------------------

export interface WizardData {
  name: string;
  username: string;
  host: string;
  port: number;
  credentialType: SshCredentialType;
  // store credentials
  savePassword?: boolean;
  password?: string;
  // ssh-key credentials
  keyPath?: string;
  // Validation result
  hostkeyFingerprint?: string;
}

export interface WizardState {
  step: WizardStep;
  data: WizardData;
  errorMessage: string | null;
  errorCategory: string | null;
  aborted: boolean;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface WizardActions {
  setName: (name: string) => void;
  setUser: (user: string) => void;
  setHost: (host: string) => void;
  setPort: (port: number) => void;
  setType: (type: SshCredentialType) => void;
  setSavePassword: (save: boolean) => void;
  setKeyPath: (path: string) => void;
  setPassword: (password: string) => void;
  validationSuccess: (hostkeyFingerprint: string, isKnownHost: boolean) => void;
  validationFailure: (category: string, message: string) => void;
  hostkeyAccept: () => void;
  hostkeyDecline: () => void;
  abort: () => void;
  reset: () => void;
}

export type WizardStore = WizardState & WizardActions;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_SSH_KEY_PATH = '~/.ssh/id_rsa';

export const initialWizardState: WizardState = {
  step: 'name',
  data: {
    name: '',
    username: '',
    host: '',
    port: 22,
    credentialType: 'store',
  },
  errorMessage: null,
  errorCategory: null,
  aborted: false,
};

// ---------------------------------------------------------------------------
// Error → step mapping (which step to re-show on validation failure)
// ---------------------------------------------------------------------------

function errorStepForCategory(category: string): WizardStep {
  switch (category) {
    case 'auth':
      // Auth failure could be password or key — re-show password if store, key-path if ssh-key
      return 'password';
    case 'network':
      return 'host';
    case 'timeout':
      return 'host';
    case 'hostkey':
      return 'hostkey-confirm';
    default:
      return 'host';
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

// WHY a module-level singleton instead of a store factory: this wizard is a
// single-use flow — one instance per process, reset by lib/run.ts before each
// render. A factory would add selector plumbing with no second consumer.
export const useWizardStore = create<WizardStore>(set => ({
  ...initialWizardState,

  setName: name => set(s => ({ step: 'user', data: { ...s.data, name }, errorMessage: null, errorCategory: null })),

  setUser: username =>
    set(s => ({ step: 'host', data: { ...s.data, username }, errorMessage: null, errorCategory: null })),

  setHost: host => set(s => ({ step: 'port', data: { ...s.data, host }, errorMessage: null, errorCategory: null })),

  setPort: port => set(s => ({ step: 'type', data: { ...s.data, port }, errorMessage: null, errorCategory: null })),

  setType: credentialType =>
    set(s => ({
      step: credentialType === 'store' ? 'save-password' : 'key-path',
      data: { ...s.data, credentialType },
      errorMessage: null,
      errorCategory: null,
    })),

  setSavePassword: savePassword =>
    set(s => ({
      step: 'password',
      data: { ...s.data, savePassword },
      errorMessage: null,
      errorCategory: null,
    })),

  setKeyPath: rawPath => {
    const keyPath = rawPath.trim() || DEFAULT_SSH_KEY_PATH;
    set(s => ({
      step: 'validating',
      data: { ...s.data, keyPath },
      errorMessage: null,
      errorCategory: null,
    }));
  },

  setPassword: password =>
    set(s => ({
      step: 'validating',
      data: { ...s.data, password },
      errorMessage: null,
      errorCategory: null,
    })),

  validationSuccess: (hostkeyFingerprint, isKnownHost) =>
    set(s => ({
      step: isKnownHost ? ('done' as const) : 'hostkey-confirm',
      data: { ...s.data, hostkeyFingerprint },
    })),

  validationFailure: (category, message) =>
    set({ step: errorStepForCategory(category), errorCategory: category, errorMessage: message }),

  hostkeyAccept: () => set({ step: 'done' as const }),

  hostkeyDecline: () => set({ step: 'type', aborted: true }),

  abort: () => set({ step: 'type', aborted: true }),

  reset: () => set(initialWizardState),
}));
