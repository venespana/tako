// tui/features/remotes/add-remote-wizard/AddRemoteWizard.tsx — Ink wizard component
import React, { useEffect } from 'react';

import { Box, Text } from 'ink';

import { TextInput, Select, PasswordInput, ConfirmInput } from '@inkjs/ui';

import { useWizardStore } from './wizard-store.js';
import type { AddRemote } from '../../../../domains/remotes/application/AddRemote.js';
import type { AddRemoteResult, RemoteDraft } from '../../../../domains/remotes/domain/types.js';

export type AddRemoteWizardProps = {
  addRemoteUc: AddRemote;
  onComplete: (result: AddRemoteResult) => void;
};

// ---------------------------------------------------------------------------
// Step-specific components
// ---------------------------------------------------------------------------

function NameStep({ onSubmit }: { onSubmit: (name: string) => void }) {
  return (
    <Box flexDirection='column'>
      <Text>Connection name:</Text>
      <TextInput defaultValue='' placeholder='e.g. nas-backup' onSubmit={onSubmit} />
    </Box>
  );
}

function UserStep({ onSubmit }: { onSubmit: (user: string) => void }) {
  return (
    <Box flexDirection='column'>
      <Text>SSH username:</Text>
      <TextInput defaultValue='' placeholder='e.g. ops' onSubmit={onSubmit} />
    </Box>
  );
}

function HostStep({ onSubmit }: { onSubmit: (host: string) => void }) {
  return (
    <Box flexDirection='column'>
      <Text>Hostname or IP address:</Text>
      <TextInput defaultValue='' placeholder='e.g. 10.0.0.5' onSubmit={onSubmit} />
    </Box>
  );
}

function PortStep({ onSubmit }: { onSubmit: (port: number) => void }) {
  const [port, setPort] = React.useState('22');
  return (
    <Box flexDirection='column'>
      <Text>SSH port (default 22):</Text>
      <TextInput
        defaultValue='22'
        placeholder='22'
        onChange={setPort}
        onSubmit={() => {
          const parsed = parseInt(port, 10);
          onSubmit(isNaN(parsed) ? 22 : parsed);
        }}
      />
    </Box>
  );
}

function TypeStep({ onSubmit }: { onSubmit: (type: 'store' | 'ssh-key') => void }) {
  return (
    <Box flexDirection='column'>
      <Text>Credential type:</Text>
      <Select
        options={[
          { label: 'Store password', value: 'store' },
          { label: 'SSH key', value: 'ssh-key' },
        ]}
        onChange={value => onSubmit(value as 'store' | 'ssh-key')}
      />
    </Box>
  );
}

function SavePasswordStep({ onSubmit }: { onSubmit: (save: boolean) => void }) {
  return (
    <Box flexDirection='column'>
      <Text>Save password for future sessions?</Text>
      <Text dimColor>(Stored obfuscated — NOT encrypted. See ADR 0014.)</Text>
      <Select
        options={[
          { label: 'Yes — save (obfuscated)', value: 'yes' },
          { label: 'No — ask each session', value: 'no' },
        ]}
        onChange={value => onSubmit(value === 'yes')}
      />
    </Box>
  );
}

function KeyPathStep({ onSubmit }: { onSubmit: (path: string) => void }) {
  return (
    <Box flexDirection='column'>
      <Text>Path to private SSH key:</Text>
      <TextInput defaultValue='' placeholder='/home/user/.ssh/id_rsa' onSubmit={onSubmit} />
    </Box>
  );
}

function PasswordStep({ onSubmit }: { onSubmit: (password: string) => void }) {
  return (
    <Box flexDirection='column'>
      <Text>SSH password:</Text>
      <PasswordInput placeholder='Enter password' onSubmit={onSubmit} />
    </Box>
  );
}

function ValidatingStep() {
  return (
    <Box flexDirection='column'>
      <Text>Validating SSH connection...</Text>
    </Box>
  );
}

function HostkeyConfirmStep({
  fingerprint,
  onAccept,
  onDecline,
}: {
  fingerprint: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <Box flexDirection='column'>
      <Text bold color='yellow'>
        Unknown host — verify fingerprint:
      </Text>
      <Text>Fingerprint: {fingerprint}</Text>
      <Text>Do you accept this hostkey?</Text>
      <ConfirmInput onConfirm={onAccept} onCancel={onDecline} />
    </Box>
  );
}

function DoneStep({ name }: { name: string }) {
  return (
    <Box flexDirection='column'>
      <Text bold color='green'>
        Remote "{name}" saved successfully!
      </Text>
    </Box>
  );
}

function ErrorDisplay({ message, category }: { message: string | null; category: string | null }) {
  if (!message) return null;
  return (
    <Box flexDirection='column' marginY={1}>
      <Text color='red'>
        {category ? `[${category}] ` : ''}Error: {message}
      </Text>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main wizard component
// ---------------------------------------------------------------------------

export function AddRemoteWizard({ addRemoteUc, onComplete }: AddRemoteWizardProps) {
  const step = useWizardStore(s => s.step);
  const errorMessage = useWizardStore(s => s.errorMessage);
  const errorCategory = useWizardStore(s => s.errorCategory);
  const data = useWizardStore(s => s.data);
  const aborted = useWizardStore(s => s.aborted);
  // Actions — extracted at top level to respect Rules of Hooks
  const setName = useWizardStore(s => s.setName);
  const setUser = useWizardStore(s => s.setUser);
  const setHost = useWizardStore(s => s.setHost);
  const setPort = useWizardStore(s => s.setPort);
  const setType = useWizardStore(s => s.setType);
  const setSavePassword = useWizardStore(s => s.setSavePassword);
  const setKeyPath = useWizardStore(s => s.setKeyPath);
  const setPassword = useWizardStore(s => s.setPassword);

  // Build draft from wizard data
  const buildDraft = React.useCallback((): RemoteDraft => {
    return {
      name: data.name,
      type: 'ssh',
      username: data.username,
      host: data.host,
      port: data.port,
      credentialType: data.credentialType,
      // Always include password for store type (needed for SSH test even if transient)
      ...(data.credentialType === 'store' && {
        savePassword: data.savePassword ?? false,
        password: data.password,
      }),
      ...(data.credentialType === 'ssh-key' && { keyPath: data.keyPath }),
    };
  }, [data]);

  // Handle validation result from AddRemote.execute
  const handleValidationResult = React.useCallback(
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
    addRemoteUc.execute(draft, { hostkeyAccepted: false }).then(handleValidationResult);
  }, [step, addRemoteUc, buildDraft, handleValidationResult]);

  // Persist WITHOUT re-validating SSH once the wizard completes.
  // savedRef guarantees save runs at most once even if this effect re-runs
  // (e.g. onComplete identity changes while step === 'done').
  const savedRef = React.useRef(false);
  useEffect(() => {
    if (step !== 'done' || savedRef.current) return;
    savedRef.current = true;
    const draft = buildDraft();
    addRemoteUc.save(draft).then(onComplete);
  }, [step, addRemoteUc, buildDraft, onComplete]);

  // Abort — complete with an unsaved result as soon as the wizard aborts
  useEffect(() => {
    if (!aborted) return;
    onComplete({ saved: false, reason: 'abort' });
  }, [aborted, onComplete]);

  return (
    <Box flexDirection='column' padding={1}>
      <Text bold>Add Remote</Text>
      <ErrorDisplay message={errorMessage} category={errorCategory} />

      {step === 'name' && <NameStep onSubmit={setName} />}
      {step === 'user' && <UserStep onSubmit={setUser} />}
      {step === 'host' && <HostStep onSubmit={setHost} />}
      {step === 'port' && <PortStep onSubmit={setPort} />}
      {step === 'type' && <TypeStep onSubmit={setType} />}
      {step === 'save-password' && <SavePasswordStep onSubmit={setSavePassword} />}
      {step === 'key-path' && <KeyPathStep onSubmit={setKeyPath} />}
      {step === 'password' && <PasswordStep onSubmit={setPassword} />}
      {step === 'validating' && <ValidatingStep />}
      {step === 'hostkey-confirm' && (
        <HostkeyConfirmStep
          fingerprint={data.hostkeyFingerprint ?? 'unknown'}
          onAccept={() => useWizardStore.getState().hostkeyAccept()}
          onDecline={() => useWizardStore.getState().hostkeyDecline()}
        />
      )}
      {step === 'done' && <DoneStep name={data.name} />}
    </Box>
  );
}
