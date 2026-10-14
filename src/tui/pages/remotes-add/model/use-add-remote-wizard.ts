// pages/remotes-add/model/use-add-remote-wizard.ts — React hook owning ALL
// wizard state interaction: step transitions, current step data,
// submit/hostkey actions, and the effects that drive validation, done-save
// (guarded by savedRef so it runs at most once) and abort. The add flow is
// consumed through services/remotes (ADR-0019 §7 — pages call services
// directly, no injected use case). ui/AddRemoteWizard.tsx stays purely
// presentational on top of this hook.
import { useCallback, useEffect, useRef } from 'react';

import { useWizardStore } from './wizard-store.js';
import type { WizardData, WizardStep } from './wizard-store.js';
import { addRemote, confirmAddRemote } from '../../../../services/remotes.js';
import type { AddRemoteResult, RemoteDraft, SshCredentialType } from '../../../../services/remotes.js';

export interface UseAddRemoteWizardOptions {
  onComplete: (result: AddRemoteResult) => void;
}

/** Wizard state + actions the ui/ component renders from. */
export interface AddRemoteWizardModel {
  /** Current wizard step. */
  step: WizardStep;
  /** Data collected across steps so far. */
  data: WizardData;
  /** Last validation error message/category, if any. */
  errorMessage: string | null;
  errorCategory: string | null;
  /** Submit handlers — each advances the wizard one step. */
  setName: (name: string) => void;
  setUser: (user: string) => void;
  setHost: (host: string) => void;
  setPort: (port: number) => void;
  setType: (type: SshCredentialType) => void;
  setKeyPath: (path: string) => void;
  setPassword: (password: string) => void;
  /** Hostkey prompt resolution. */
  acceptHostkey: () => void;
  declineHostkey: () => void;
  /** Abort the wizard — completes with { saved: false, reason: 'abort' }. */
  abort: () => void;
}

export function useAddRemoteWizard({ onComplete }: UseAddRemoteWizardOptions): AddRemoteWizardModel {
  const step = useWizardStore(s => s.step);
  const data = useWizardStore(s => s.data);
  const errorMessage = useWizardStore(s => s.errorMessage);
  const errorCategory = useWizardStore(s => s.errorCategory);
  const aborted = useWizardStore(s => s.aborted);
  // Actions — extracted at top level to respect Rules of Hooks
  const setName = useWizardStore(s => s.setName);
  const setUser = useWizardStore(s => s.setUser);
  const setHost = useWizardStore(s => s.setHost);
  const setPort = useWizardStore(s => s.setPort);
  const setType = useWizardStore(s => s.setType);
  const setKeyPath = useWizardStore(s => s.setKeyPath);
  const setPassword = useWizardStore(s => s.setPassword);
  const hostkeyAccept = useWizardStore(s => s.hostkeyAccept);
  const hostkeyDecline = useWizardStore(s => s.hostkeyDecline);
  const abort = useWizardStore(s => s.abort);

  // Build draft from wizard data
  const buildDraft = useCallback((): RemoteDraft => {
    return {
      name: data.name,
      type: 'ssh',
      username: data.username,
      host: data.host,
      port: data.port,
      credentialType: data.credentialType,
      // store: persisted obfuscated; interactive: used only for pre-save validation
      ...((data.credentialType === 'store' || data.credentialType === 'interactive') && {
        password: data.password,
      }),
      ...(data.credentialType === 'ssh-key' && { keyPath: data.keyPath }),
    };
  }, [data]);

  // Handle validation result from the service add flow
  const handleValidationResult = useCallback(
    (result: AddRemoteResult) => {
      const store = useWizardStore.getState();
      if (result.saved) {
        store.validationSuccess(result.hostkeyFingerprint ?? 'unknown', true);
      } else if (result.reason === 'hostkey') {
        store.validationSuccess(result.hostkeyFingerprint ?? 'unknown', false);
      } else if (result.reason === 'duplicate') {
        const message =
          result.duplicateKind === 'endpoint'
            ? `${data.username}@${data.host}:${data.port} already exists`
            : `A remote named "${data.name}" already exists`;
        store.validationFailure('duplicate', message);
      } else {
        store.validationFailure(
          result.reason ?? 'unknown',
          result.message ?? `SSH ${result.reason ?? 'validation'} failed`
        );
      }
    },
    [data.name, data.username, data.host, data.port]
  );

  // Execute SSH validation when entering validating step
  useEffect(() => {
    if (step !== 'validating') return;
    const draft = buildDraft();
    void addRemote({ draft, hostkeyAccepted: false }).then(handleValidationResult);
  }, [step, buildDraft, handleValidationResult]);

  // Persist WITHOUT re-validating SSH once the wizard completes.
  // savedRef guarantees save runs at most once even if this effect re-runs
  // (e.g. onComplete identity changes while step === 'done').
  const savedRef = useRef(false);
  useEffect(() => {
    if (step !== 'done' || savedRef.current) return;
    savedRef.current = true;
    const draft = buildDraft();
    void confirmAddRemote(draft).then(onComplete);
  }, [step, buildDraft, onComplete]);

  // Abort — complete with an unsaved result as soon as the wizard aborts
  useEffect(() => {
    if (!aborted) return;
    onComplete({ saved: false, reason: 'abort' });
  }, [aborted, onComplete]);

  return {
    step,
    data,
    errorMessage,
    errorCategory,
    setName,
    setUser,
    setHost,
    setPort,
    setType,
    setKeyPath,
    setPassword,
    acceptHostkey: hostkeyAccept,
    declineHostkey: hostkeyDecline,
    abort,
  };
}
