// tui/features/remotes/add-remote-wizard/ui/AddRemoteWizard.tsx — Single-page
// form: all fields always visible, Tab/Shift+Tab navigates between fields,
// Enter submits. No step-by-step wizard — a web-style form.
import { useState, useCallback } from 'react';

import { Box, Text, useInput } from 'ink';
import { TextInput } from '@inkjs/ui';

import { PasswordInput, Select } from '@inkjs/ui';
import type { Key } from 'ink';

import type { AddRemote } from '../../../../../domains/remotes/application/AddRemote.js';
import type { AddRemoteResult, SshCredentialType } from '../../../../../domains/remotes/domain/types.js';
import { EditingGuard } from '../../../../shared/ui/EditingGuard.js';
import { useAddRemoteWizard } from '../model/use-add-remote-wizard.js';

export type AddRemoteWizardProps = {
  addRemoteUc: AddRemote;
  onComplete: (result: AddRemoteResult) => void;
};

// ---------------------------------------------------------------------------
// Field IDs (for Tab navigation order)
// ---------------------------------------------------------------------------

type FieldId = 'name' | 'username' | 'host' | 'port' | 'type' | 'keyPath' | 'password';

const FIELD_ORDER: FieldId[] = ['name', 'username', 'host', 'port', 'type', 'keyPath', 'password'];

function nextField(current: FieldId, credentialType: SshCredentialType): FieldId {
  const idx = FIELD_ORDER.indexOf(current);
  const next = FIELD_ORDER[idx + 1];
  if (!next) return current;

  // Skip conditional fields based on credential type
  if (next === 'keyPath' && credentialType !== 'ssh-key') return nextField(next, credentialType);
  if (next === 'password' && credentialType === 'ssh-key') return nextField(next, credentialType);
  return next;
}

function prevField(current: FieldId, credentialType: SshCredentialType): FieldId {
  const idx = FIELD_ORDER.indexOf(current);
  const prev = FIELD_ORDER[idx - 1];
  if (!prev) return current;

  if (prev === 'keyPath' && credentialType !== 'ssh-key') return prevField(prev, credentialType);
  if (prev === 'password' && credentialType === 'ssh-key') return prevField(prev, credentialType);
  return prev;
}

// ---------------------------------------------------------------------------
// TextInput that only intercepts Tab when focused
// ---------------------------------------------------------------------------

interface TextInputFieldProps {
  id: FieldId;
  label: string;
  value: string;
  focused: boolean;
  onFocus: (id: FieldId) => void;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
}

function TextInputField({
  id,
  label,
  value,
  focused,
  onFocus,
  onChange,
  onSubmit,
  placeholder,
}: TextInputFieldProps) {
  const handleKey = useCallback(
    (input: string, key: Key) => {
      if (key.tab) {
        onFocus(nextField(id, 'store'));
        return;
      }
    },
    [id, onFocus]
  );

  // Only this field's handler is active when focused
  useInput(handleKey, { isActive: focused });

  return (
    <Box flexDirection='column'>
      <Text>{label}</Text>
      <TextInput
        defaultValue={value}
        placeholder={placeholder}
        onChange={onChange}
        onSubmit={onSubmit}
      />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main form
// ---------------------------------------------------------------------------

export function AddRemoteWizard({ addRemoteUc, onComplete }: AddRemoteWizardProps) {
  const wizard = useAddRemoteWizard({ addRemoteUc, onComplete });
  const [focused, setFocused] = useState<FieldId>('name');

  const credentialType = wizard.data.credentialType;
  const showKeyPath = credentialType === 'ssh-key';
  const showPassword = credentialType === 'store' || credentialType === 'interactive';

  const navigateNext = useCallback(() => {
    const next = nextField(focused, credentialType);
    if (next !== focused) setFocused(next);
  }, [focused, credentialType]);

  const navigatePrev = useCallback(() => {
    const prev = prevField(focused, credentialType);
    if (prev !== focused) setFocused(prev);
  }, [focused, credentialType]);

  // Tab / Shift+Tab at form level — only fires when no field input has intercepted it
  useInput(
    (input: string, key: Key) => {
      if (key.tab && !key.shift) {
        navigateNext();
      } else if (key.tab && key.shift) {
        navigatePrev();
      }
    },
    { isActive: true }
  );

  const handleSubmit = useCallback(() => {
    // Determine which submit handler to call based on credential type and focused field
    switch (focused) {
      case 'name':
        if (wizard.data.name) setFocused('username');
        break;
      case 'username':
        if (wizard.data.username) setFocused('host');
        break;
      case 'host':
        if (wizard.data.host) setFocused('port');
        break;
      case 'port':
        setFocused('type');
        break;
      case 'type':
        if (showKeyPath) setFocused('keyPath');
        else if (showPassword) setFocused('password');
        else triggerValidation();
        break;
      case 'keyPath':
        triggerValidation();
        break;
      case 'password':
        triggerValidation();
        break;
    }
  }, [focused, wizard.data, showKeyPath, showPassword]);

  function triggerValidation() {
    // Submit based on credential type
    if (credentialType === 'ssh-key') {
      wizard.setKeyPath(wizard.data.keyPath ?? '~/.ssh/id_rsa');
    } else {
      wizard.setPassword(wizard.data.password ?? '');
    }
  }

  return (
    <EditingGuard isEditing={true}>
      <Box flexDirection='column' padding={1}>
        <Text bold>Add Remote</Text>

        {wizard.errorMessage && (
          <Text color='red'>
            {wizard.errorCategory ? `[${wizard.errorCategory}] ` : ''}Error: {wizard.errorMessage}
          </Text>
        )}

        {/* Connection name */}
        <TextInputField
          id='name'
          label='Connection name:'
          value={wizard.data.name}
          focused={focused === 'name'}
          onFocus={setFocused}
          onChange={wizard.setName}
          onSubmit={handleSubmit}
          placeholder='e.g. nas-backup'
        />

        {/* Username */}
        <TextInputField
          id='username'
          label='SSH username:'
          value={wizard.data.username}
          focused={focused === 'username'}
          onFocus={setFocused}
          onChange={wizard.setUser}
          onSubmit={handleSubmit}
          placeholder='e.g. ops'
        />

        {/* Host */}
        <TextInputField
          id='host'
          label='Hostname or IP address:'
          value={wizard.data.host}
          focused={focused === 'host'}
          onFocus={setFocused}
          onChange={wizard.setHost}
          onSubmit={handleSubmit}
          placeholder='e.g. 10.0.0.5'
        />

        {/* Port */}
        <TextInputField
          id='port'
          label='SSH port (default 22):'
          value={String(wizard.data.port)}
          focused={focused === 'port'}
          onFocus={setFocused}
          onChange={v => wizard.setPort(parseInt(v, 10) || 22)}
          onSubmit={handleSubmit}
          placeholder='22'
        />

        {/* Credential type */}
        <Box flexDirection='column'>
          <Text>Credential type:</Text>
          <Select
            options={[
              { label: 'Store password (obfuscated)', value: 'store' },
              { label: 'SSH key', value: 'ssh-key' },
              { label: 'Ask every session — never stored', value: 'interactive' },
            ]}
            onChange={value => wizard.setType(value as SshCredentialType)}
          />
        </Box>

        {/* Key path — only for ssh-key */}
        {showKeyPath && (
          <TextInputField
            id='keyPath'
            label='Path to private SSH key:'
            value={wizard.data.keyPath ?? ''}
            focused={focused === 'keyPath'}
            onFocus={setFocused}
            onChange={wizard.setKeyPath}
            onSubmit={handleSubmit}
            placeholder='/home/user/.ssh/id_rsa'
          />
        )}

        {/* Password — only for store / interactive */}
        {showPassword && (
          <Box flexDirection='column'>
            <Text>
              SSH password:
              {credentialType === 'interactive' && (
                <Text dimColor> (used only to validate — never saved)</Text>
              )}
            </Text>
            <PasswordInput
              placeholder='Enter password'
              onSubmit={() => {
                wizard.setPassword(wizard.data.password ?? '');
              }}
            />
          </Box>
        )}

        {wizard.step === 'validating' && <Text dimColor>Validating SSH connection...</Text>}

        {wizard.step === 'hostkey-confirm' && (
          <Box flexDirection='column'>
            <Text bold color='yellow'>
              Unknown host — verify fingerprint:
            </Text>
            <Text>Fingerprint: {wizard.data.hostkeyFingerprint}</Text>
            <Text>Do you accept this hostkey?</Text>
          </Box>
        )}

        {wizard.step === 'done' && (
          <Text bold color='green'>
            Remote &quot;{wizard.data.name}&quot; saved successfully!
          </Text>
        )}
      </Box>
    </EditingGuard>
  );
}
