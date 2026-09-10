// tui/features/remotes/add-remote-wizard/ui/AddRemoteWizard.tsx — Ink wizard
// component. Pure presentation: state and effects live in the model hook
// (use-add-remote-wizard.ts); this component renders step screens from hook
// state and delegates user events to hook actions.
import { useState } from 'react';

import { Box, Text } from 'ink';

import { TextInput, Select, PasswordInput, ConfirmInput } from '@inkjs/ui';

import type { AddRemote } from '../../../../../domains/remotes/application/AddRemote.js';
import type { AddRemoteResult, SshCredentialType } from '../../../../../domains/remotes/domain/types.js';
import { EditingGuard } from '../../../../shared/ui/EditingGuard.js';
import { useAddRemoteWizard } from '../model/use-add-remote-wizard.js';

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
  const [port, setPort] = useState('22');
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

function TypeStep({ onSubmit }: { onSubmit: (type: SshCredentialType) => void }) {
  return (
    <Box flexDirection='column'>
      <Text>Credential type:</Text>
      <Select
        options={[
          { label: 'Store password (obfuscated)', value: 'store' },
          { label: 'SSH key', value: 'ssh-key' },
          { label: 'Ask every session — never stored', value: 'interactive' },
        ]}
        onChange={value => onSubmit(value as SshCredentialType)}
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

function PasswordStep({ onSubmit, validateOnly }: { onSubmit: (password: string) => void; validateOnly: boolean }) {
  return (
    <Box flexDirection='column'>
      <Text>SSH password:</Text>
      {validateOnly && <Text dimColor>(Password used only to validate — never saved)</Text>}
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
  const wizard = useAddRemoteWizard({ addRemoteUc, onComplete });

  // Steps that render a text input (TextInput or PasswordInput).
  const editingSteps = new Set(['name', 'user', 'host', 'port', 'key-path', 'password']);
  const isEditing = editingSteps.has(wizard.step);

  return (
    <EditingGuard isEditing={isEditing}>
      <Box flexDirection='column' padding={1}>
        <Text bold>Add Remote</Text>
        <ErrorDisplay message={wizard.errorMessage} category={wizard.errorCategory} />

        {wizard.step === 'name' && <NameStep onSubmit={wizard.setName} />}
        {wizard.step === 'user' && <UserStep onSubmit={wizard.setUser} />}
        {wizard.step === 'host' && <HostStep onSubmit={wizard.setHost} />}
        {wizard.step === 'port' && <PortStep onSubmit={wizard.setPort} />}
        {wizard.step === 'type' && <TypeStep onSubmit={wizard.setType} />}
        {wizard.step === 'key-path' && <KeyPathStep onSubmit={wizard.setKeyPath} />}
        {wizard.step === 'password' && (
          <PasswordStep onSubmit={wizard.setPassword} validateOnly={wizard.data.credentialType === 'interactive'} />
        )}
        {wizard.step === 'validating' && <ValidatingStep />}
        {wizard.step === 'hostkey-confirm' && (
          <HostkeyConfirmStep
            fingerprint={wizard.data.hostkeyFingerprint ?? 'unknown'}
            onAccept={wizard.acceptHostkey}
            onDecline={wizard.declineHostkey}
          />
        )}
        {wizard.step === 'done' && <DoneStep name={wizard.data.name} />}
      </Box>
    </EditingGuard>
  );
}
