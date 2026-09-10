// tui/features/remotes/add-remote-wizard/ui/AddRemoteWizard.tsx — Progressive
// disclosure: only the active field is visible and editable. Tab/Enter advances
// to the next field; Shift+Tab goes back and clears the current field.
// Esc restores normal navigation (leaves editing mode).
import { useState, useCallback, useEffect } from 'react';

import { Box, Text, useInput } from 'ink';
import { TextInput, PasswordInput, Select } from '@inkjs/ui';
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
// Field ordering and navigation
// ---------------------------------------------------------------------------

type FieldId = 'name' | 'username' | 'host' | 'port' | 'type' | 'keyPath' | 'password';

const FIELD_ORDER: FieldId[] = ['name', 'username', 'host', 'port', 'type', 'keyPath', 'password'];

function getVisibleFields(credentialType: SshCredentialType): FieldId[] {
  return FIELD_ORDER.filter(f => {
    if (f === 'keyPath') return credentialType === 'ssh-key';
    if (f === 'password') return credentialType === 'store' || credentialType === 'interactive';
    return true;
  });
}

function nextField(current: FieldId, visible: FieldId[]): FieldId | null {
  const idx = visible.indexOf(current);
  return idx >= 0 && idx < visible.length - 1 ? visible[idx + 1]! : null;
}

function prevField(current: FieldId, visible: FieldId[]): FieldId | null {
  const idx = visible.indexOf(current);
  return idx > 0 ? visible[idx - 1]! : null;
}

// ---------------------------------------------------------------------------
// AddRemoteWizard
// ---------------------------------------------------------------------------

export function AddRemoteWizard({ addRemoteUc, onComplete }: AddRemoteWizardProps) {
  const wizard = useAddRemoteWizard({ addRemoteUc, onComplete });
  const { data } = wizard;

  const [activeField, setActiveField] = useState<FieldId | null>('name');
  const [localValues, setLocalValues] = useState<Record<string, string>>({});

  const visible = getVisibleFields(data.credentialType);
  const isEditing = activeField !== null;

  const getLocalValue = (field: FieldId, wizardData: typeof data): string => {
    const local = localValues[field];
    if (local !== undefined) return local;
    switch (field) {
      case 'name': return wizardData.name;
      case 'username': return wizardData.username;
      case 'host': return wizardData.host;
      case 'port': return String(wizardData.port);
      case 'type': return wizardData.credentialType;
      case 'keyPath': return wizardData.keyPath ?? '';
      case 'password': return wizardData.password ?? '';
    }
  };

  const getWizardSetter = (field: FieldId): (v: string) => void => {
    switch (field) {
      case 'name': return (v: string) => wizard.setName(v);
      case 'username': return (v: string) => wizard.setUser(v);
      case 'host': return (v: string) => wizard.setHost(v);
      case 'port': return (v: string) => wizard.setPort(parseInt(v, 10) || 22);
      case 'type': return (v: string) => wizard.setType(v as SshCredentialType);
      case 'keyPath': return (v: string) => wizard.setKeyPath(v);
      case 'password': return (v: string) => wizard.setPassword(v);
    }
  };

  const advance = useCallback(() => {
    if (activeField === null) return;
    const next = nextField(activeField, visible);
    if (next) {
      setActiveField(next);
    } else {
      // Last visible field — trigger validation
      if (activeField === 'type') {
        if (data.credentialType === 'ssh-key') {
          wizard.setKeyPath(localValues['keyPath'] ?? '~/.ssh/id_rsa');
        } else {
          wizard.setPassword(localValues['password'] ?? '');
        }
      } else if (activeField === 'keyPath') {
        wizard.setKeyPath(localValues['keyPath'] ?? '~/.ssh/id_rsa');
      } else if (activeField === 'password') {
        wizard.setPassword(localValues['password'] ?? '');
      }
    }
  }, [activeField, visible, wizard, data, localValues]);

  const goBack = useCallback(() => {
    if (activeField === null) return;
    // Clear current field
    setLocalValues(prev => ({ ...prev, [activeField]: '' }));
    const prev = prevField(activeField, visible);
    if (prev) {
      setActiveField(prev);
    }
  }, [activeField, visible]);

  // Global keyboard handler for Tab navigation and field advancement
  useInput(
    (_input: string, key: Key) => {
      if (!isEditing) return;
      if (key.tab && !key.shift) { advance(); return; }
      if (key.tab && key.shift) { goBack(); return; }
      if (key.return) { advance(); return; }
    },
    { isActive: isEditing }
  );

  const submitCurrentField = () => {
    if (activeField === null) return;
    const setter = getWizardSetter(activeField);
    const value = getLocalValue(activeField, data);
    setter(value);
    advance();
  };

  return (
    <EditingGuard isEditing={isEditing}>
      <Box flexDirection='column' padding={1}>
        <Text bold>Add Remote</Text>

        {wizard.errorMessage && (
          <Text color='red'>
            {wizard.errorCategory ? `[${wizard.errorCategory}] ` : ''}{wizard.errorMessage}
          </Text>
        )}

        {/* Connection name */}
        {visible.includes('name') && (
          <Box flexDirection='column'>
            <Text>Connection name:</Text>
            {activeField === 'name' ? (
              <TextInput
                defaultValue={getLocalValue('name', data)}
                placeholder='e.g. nas-backup'
                onChange={v => setLocalValues(prev => ({ ...prev, name: v }))}
                onSubmit={submitCurrentField}
              />
            ) : (
              <Text dimColor>  {data.name || '(not set)'} — Tab to edit</Text>
            )}
          </Box>
        )}

        {/* Username */}
        {visible.includes('username') && (
          <Box flexDirection='column'>
            <Text>SSH username:</Text>
            {activeField === 'username' ? (
              <TextInput
                defaultValue={getLocalValue('username', data)}
                placeholder='e.g. ops'
                onChange={v => setLocalValues(prev => ({ ...prev, username: v }))}
                onSubmit={submitCurrentField}
              />
            ) : (
              <Text dimColor>  {data.username || '(not set)'} — Tab to edit</Text>
            )}
          </Box>
        )}

        {/* Host */}
        {visible.includes('host') && (
          <Box flexDirection='column'>
            <Text>Hostname or IP address:</Text>
            {activeField === 'host' ? (
              <TextInput
                defaultValue={getLocalValue('host', data)}
                placeholder='e.g. 10.0.0.5'
                onChange={v => setLocalValues(prev => ({ ...prev, host: v }))}
                onSubmit={submitCurrentField}
              />
            ) : (
              <Text dimColor>  {data.host || '(not set)'} — Tab to edit</Text>
            )}
          </Box>
        )}

        {/* Port */}
        {visible.includes('port') && (
          <Box flexDirection='column'>
            <Text>SSH port (default 22):</Text>
            {activeField === 'port' ? (
              <TextInput
                defaultValue={getLocalValue('port', data)}
                placeholder='22'
                onChange={v => setLocalValues(prev => ({ ...prev, port: v }))}
                onSubmit={submitCurrentField}
              />
            ) : (
              <Text dimColor>  {data.port} — Tab to edit</Text>
            )}
          </Box>
        )}

        {/* Credential type */}
        {visible.includes('type') && (
          <Box flexDirection='column'>
            <Text>Credential type:</Text>
            <Select
              options={[
                { label: 'Store password (obfuscated)', value: 'store' },
                { label: 'SSH key', value: 'ssh-key' },
                { label: 'Ask every session — never stored', value: 'interactive' },
              ]}
              onChange={v => wizard.setType(v as SshCredentialType)}
            />
          </Box>
        )}

        {/* Key path — ssh-key only */}
        {visible.includes('keyPath') && (
          <Box flexDirection='column'>
            <Text>Path to private SSH key:</Text>
            {activeField === 'keyPath' ? (
              <TextInput
                defaultValue={getLocalValue('keyPath', data)}
                placeholder='~/.ssh/id_rsa'
                onChange={v => setLocalValues(prev => ({ ...prev, keyPath: v }))}
                onSubmit={submitCurrentField}
              />
            ) : (
              <Text dimColor>  {data.keyPath || '(not set)'} — Tab to edit</Text>
            )}
          </Box>
        )}

        {/* Password — store / interactive */}
        {visible.includes('password') && (
          <Box flexDirection='column'>
            <Text>
              SSH password:
              {data.credentialType === 'interactive' && (
                <Text dimColor> (validation only — never saved)</Text>
              )}
            </Text>
            {activeField === 'password' ? (
              <PasswordInput
                placeholder='Enter password'
                onSubmit={() => { wizard.setPassword(localValues['password'] ?? ''); advance(); }}
              />
            ) : (
              <Text dimColor>  ●●●●●●●● — Tab to edit</Text>
            )}
          </Box>
        )}

        {wizard.step === 'validating' && <Text dimColor>Validating SSH connection...</Text>}

        {wizard.step === 'hostkey-confirm' && (
          <Box flexDirection='column'>
            <Text bold color='yellow'>Unknown host — verify fingerprint:</Text>
            <Text>Fingerprint: {data.hostkeyFingerprint}</Text>
            <Text>Do you accept this hostkey? [y/N]</Text>
          </Box>
        )}

        {wizard.step === 'done' && (
          <Text bold color='green'>
            Remote &quot;{data.name}&quot; saved successfully!
          </Text>
        )}

        <Text dimColor>
          {isEditing
            ? `Editing: ${activeField} · Tab: next · Shift+Tab: back & clear · Esc: restore nav`
            : 'Tab to start editing'}
        </Text>
      </Box>
    </EditingGuard>
  );
}
