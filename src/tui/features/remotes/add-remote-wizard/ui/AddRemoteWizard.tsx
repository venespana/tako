// tui/features/remotes/add-remote-wizard/ui/AddRemoteWizard.tsx — Progressive
// disclosure driven by the wizard store's step: fields up to the current step
// are revealed (completed ones show their fixed value on one line), the field
// at the current step is editable, later fields are hidden.
// Enter is handled by each input (TextInput.onSubmit / Select.onChange) — the
// global handler only manages Tab navigation so Enter is never processed twice.
import { useState, useCallback } from 'react';

import { Box, Text, useInput } from 'ink';
import { TextInput, PasswordInput, Select } from '@inkjs/ui';
import type { Key } from 'ink';

import type { AddRemote } from '../../../../../domains/remotes/application/AddRemote.js';
import type { AddRemoteResult, SshCredentialType } from '../../../../../domains/remotes/domain/types.js';
import type { WizardStep } from '../model/wizard-store.js';
import { EditingGuard } from '../../../../shared/ui/EditingGuard.js';
import { useAddRemoteWizard } from '../model/use-add-remote-wizard.js';

export type AddRemoteWizardProps = {
  addRemoteUc: AddRemote;
  onComplete: (result: AddRemoteResult) => void;
};

// ---------------------------------------------------------------------------
// Field ordering, step mapping and navigation
// ---------------------------------------------------------------------------

type FieldId = 'name' | 'username' | 'host' | 'port' | 'type' | 'keyPath' | 'password';

const FIELD_ORDER: FieldId[] = ['name', 'username', 'host', 'port', 'type', 'keyPath', 'password'];

// Navigation order for the active credential type (excludes the unused
// credential-specific field). Used for Tab / Shift+Tab movement only —
// VISIBILITY is decided by the step index, not by this list.
function getNavFields(credentialType: SshCredentialType): FieldId[] {
  return FIELD_ORDER.filter(f => {
    if (f === 'keyPath') return credentialType === 'ssh-key';
    if (f === 'password') return credentialType === 'store' || credentialType === 'interactive';
    return true;
  });
}

// Index of the furthest field revealed by each wizard step. A field is visible
// when its FIELD_ORDER index is <= this threshold (plus credential filters).
const STEP_INDEX: Record<WizardStep, number> = {
  name: 0,
  user: 1,
  host: 2,
  port: 3,
  type: 4,
  'key-path': 5,
  password: 6,
  validating: 7,
  'hostkey-confirm': 7,
  done: 7,
};

// Which field the user is editing at each collection step (null for the
// terminal steps where no field is being edited).
const STEP_FIELD: Record<WizardStep, FieldId | null> = {
  name: 'name',
  user: 'username',
  host: 'host',
  port: 'port',
  type: 'type',
  'key-path': 'keyPath',
  password: 'password',
  validating: null,
  'hostkey-confirm': null,
  done: null,
};

// ---------------------------------------------------------------------------
// AddRemoteWizard
// ---------------------------------------------------------------------------

export function AddRemoteWizard({ addRemoteUc, onComplete }: AddRemoteWizardProps) {
  const wizard = useAddRemoteWizard({ addRemoteUc, onComplete });
  const { data } = wizard;

  // The active field is DERIVED from the store's step (single source of truth).
  // `backField` is the only local navigation state: Shift+Tab moves it behind
  // the step field; submitting clears it so the step regains control.
  const [backField, setBackField] = useState<FieldId | null>(null);
  // Draft values while editing (the Select writes the store directly).
  const [draft, setDraft] = useState<Partial<Record<FieldId, string>>>({});

  const stepField = STEP_FIELD[wizard.step];
  const activeField = backField ?? stepField;
  const isEditing = activeField !== null;

  const revealed = Math.max(
    STEP_INDEX[wizard.step],
    activeField ? FIELD_ORDER.indexOf(activeField) : 0
  );

  const isFieldVisible = (field: FieldId): boolean => {
    if (FIELD_ORDER.indexOf(field) > revealed) return false;
    if (field === 'keyPath' && data.credentialType !== 'ssh-key') return false;
    if (field === 'password' && data.credentialType !== 'store' && data.credentialType !== 'interactive') return false;
    return true;
  };

  // Fixed value shown for a revealed, non-active field
  const getDisplayValue = (field: FieldId): string => {
    switch (field) {
      case 'name': return data.name;
      case 'username': return data.username;
      case 'host': return data.host;
      case 'port': return String(data.port);
      case 'type': return data.credentialType;
      case 'keyPath': return data.keyPath ?? '~/.ssh/id_rsa';
      case 'password': return '●●●●●●●●';
    }
  };

  // Commit the active field's draft to the store. Each setter also advances
  // the store's step, which is what actually moves the form forward.
  const submitField = useCallback(() => {
    setBackField(null);
    if (activeField === null) return;
    const value = draft[activeField] ?? '';
    switch (activeField) {
      case 'name': wizard.setName(value); break;
      case 'username': wizard.setUser(value); break;
      case 'host': wizard.setHost(value); break;
      case 'port': wizard.setPort(parseInt(value, 10) || 22); break;
      // The Select writes the store on selection; never overwrite it with an
      // empty draft when the user just Tabs through the field.
      case 'type': if (value) wizard.setType(value as SshCredentialType); break;
      case 'keyPath': wizard.setKeyPath(value); break;
      case 'password': wizard.setPassword(value); break;
    }
  }, [activeField, draft, wizard]);

  // Tab: commit the active field. The store's step advancing is what moves
  // the form to the next field (submitting the last field triggers
  // validation via its store setter).
  const advance = useCallback(() => {
    submitField();
  }, [submitField]);

  // Shift+Tab: clear current draft and go back to the previous nav field
  const goBack = useCallback(() => {
    if (activeField === null) return;
    setDraft(v => ({ ...v, [activeField]: '' }));
    const nav = getNavFields(data.credentialType);
    const idx = nav.indexOf(activeField);
    if (idx > 0) setBackField(nav[idx - 1]!);
  }, [activeField, data.credentialType]);

  // Global handler: Tab navigation while editing; Esc cancels the wizard from
  // ANY state (EditingGuard blocks the app-level Esc, so the wizard owns it);
  // hostkey-confirm resolves with y/N. Enter belongs to each input
  // (TextInput.onSubmit / Select.onChange) — handling it here too would commit
  // every keypress twice.
  useInput(
    (input: string, key: Key) => {
      if (wizard.step === 'hostkey-confirm') {
        if (input === 'y' || input === 'Y') wizard.acceptHostkey();
        else if (input === 'n' || input === 'N') wizard.declineHostkey();
        return;
      }
      if (key.escape) {
        if (wizard.step !== 'done') wizard.abort();
        return;
      }
      if (!isEditing) return;
      if (key.tab && !key.shift) { advance(); return; }
      if (key.tab && key.shift) { goBack(); return; }
    },
    { isActive: true }
  );

  // One-line row for a completed field
  const DoneRow = ({ label, field }: { label: string; field: FieldId }) => (
    <Text dimColor>
      {label} {getDisplayValue(field)}
    </Text>
  );

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
        {isFieldVisible('name') && (
          activeField === 'name' ? (
            <Box flexDirection='column'>
              <Text>Connection name:</Text>
              <TextInput
                defaultValue={draft.name ?? data.name}
                placeholder='e.g. nas-backup'
                onChange={v => setDraft(prev => ({ ...prev, name: v }))}
                onSubmit={advance}
              />
            </Box>
          ) : (
            <DoneRow label='Connection name:' field='name' />
          )
        )}

        {/* Username */}
        {isFieldVisible('username') && (
          activeField === 'username' ? (
            <Box flexDirection='column'>
              <Text>SSH username:</Text>
              <TextInput
                defaultValue={draft.username ?? data.username}
                placeholder='e.g. ops'
                onChange={v => setDraft(prev => ({ ...prev, username: v }))}
                onSubmit={advance}
              />
            </Box>
          ) : (
            <DoneRow label='SSH username:' field='username' />
          )
        )}

        {/* Host */}
        {isFieldVisible('host') && (
          activeField === 'host' ? (
            <Box flexDirection='column'>
              <Text>Hostname or IP address:</Text>
              <TextInput
                defaultValue={draft.host ?? data.host}
                placeholder='e.g. 10.0.0.5'
                onChange={v => setDraft(prev => ({ ...prev, host: v }))}
                onSubmit={advance}
              />
            </Box>
          ) : (
            <DoneRow label='Host:' field='host' />
          )
        )}

        {/* Port */}
        {isFieldVisible('port') && (
          activeField === 'port' ? (
            <Box flexDirection='column'>
              <Text>SSH port (default 22):</Text>
              <TextInput
                defaultValue={draft.port ?? String(data.port)}
                placeholder='22'
                onChange={v => setDraft(prev => ({ ...prev, port: v }))}
                onSubmit={advance}
              />
            </Box>
          ) : (
            <DoneRow label='Port:' field='port' />
          )
        )}

        {/* Credential type */}
        {isFieldVisible('type') && (
          activeField === 'type' ? (
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
          ) : (
            <DoneRow label='Credential type:' field='type' />
          )
        )}

        {/* Key path — ssh-key only */}
        {isFieldVisible('keyPath') && (
          activeField === 'keyPath' ? (
            <Box flexDirection='column'>
              <Text>Path to private SSH key:</Text>
              <TextInput
                defaultValue={draft.keyPath ?? data.keyPath ?? ''}
                placeholder='~/.ssh/id_rsa'
                onChange={v => setDraft(prev => ({ ...prev, keyPath: v }))}
                onSubmit={advance}
              />
            </Box>
          ) : (
            <DoneRow label='Key path:' field='keyPath' />
          )
        )}

        {/* Password — store / interactive */}
        {isFieldVisible('password') && (
          activeField === 'password' ? (
            <Box flexDirection='column'>
              <Text>
                SSH password:
                {data.credentialType === 'interactive' && (
                  <Text dimColor> (validation only — never saved)</Text>
                )}
              </Text>
              <PasswordInput
                placeholder='Enter password'
                onChange={v => setDraft(prev => ({ ...prev, password: v }))}
                onSubmit={value => wizard.setPassword(value)}
              />
            </Box>
          ) : (
            <DoneRow label='Password:' field='password' />
          )
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
            ? `Editing: ${activeField} · Enter: confirm · Tab: next · Shift+Tab: back & clear · Esc: cancel`
            : 'Tab to start editing · Esc: cancel'}
        </Text>
      </Box>
    </EditingGuard>
  );
}
