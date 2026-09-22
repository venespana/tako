// features/tasks/job-form/ui/JobForm.tsx — create/edit job form (task 8.6).
// Single-screen form driven by the closed job taxonomy: type toggle (t),
// lifecycle op cycle (o), scope toggles (1/2/3), Tab between text fields,
// Enter submits, Esc cancels. Validation feedback is the model's
// validateJobForm — invalid forms simply cannot submit (buildJobDefinition
// returns null).
import { useMemo, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import { TextInput } from '@inkjs/ui';

import type { JobDefinition, StackLifecycleOp, PruneScopes } from '../../../../../domains/agent/domain/types.js';
import { EditingGuard } from '../../../../shared/ui/EditingGuard.js';
import {
  SCOPE_OPTIONS,
  buildJobDefinition,
  toggleScope,
  validateJobForm,
  type JobFormType,
  type JobFormValues,
} from '../model/job-form.js';

export interface JobFormProps {
  /** Values to start from (EMPTY_JOB_FORM for create; jobToForm for edit). */
  readonly initial: JobFormValues;
  readonly onCancel: () => void;
  /** Called with the built JobDefinition — never with an invalid form. */
  readonly onSubmit: (job: JobDefinition) => void;
}

type TextField = 'id' | 'stackDir' | 'cron';

const OP_CYCLE: readonly StackLifecycleOp[] = ['up', 'down', 'pull', 'restart'];

export function JobForm({ initial, onCancel, onSubmit }: JobFormProps): React.ReactElement {
  const [values, setValues] = useState<JobFormValues>(initial);
  const [activeField, setActiveField] = useState<TextField | null>(null);
  const errors = useMemo(() => validateJobForm(values), [values]);
  const isLifecycle = values.type === 'stack-lifecycle';
  const isPrune = values.type === 'prune';

  const cycleType = (): void => {
    setValues(previous => ({
      ...previous,
      type: (previous.type === 'prune' ? 'stack-lifecycle' : 'prune') as JobFormType,
    }));
  };

  const cycleOp = (): void => {
    setValues(previous => {
      const index = OP_CYCLE.indexOf(previous.op);
      return { ...previous, op: OP_CYCLE[(index + 1) % OP_CYCLE.length] ?? 'up' };
    });
  };

  const toggleScopeValue = (scope: PruneScopes): void => {
    setValues(previous => ({ ...previous, scopes: toggleScope(previous.scopes, scope) }));
  };

  const submit = (): void => {
    const job = buildJobDefinition(values);
    if (job === null) return; // errors are already on screen — fix and retry
    onSubmit(job);
  };

  // When no text field is active the hotkeys own the keyboard.
  useInput(
    (input, key) => {
      if (key.tab) {
        const fields: TextField[] = isLifecycle ? ['id', 'stackDir', 'cron'] : ['id', 'cron'];
        const index = activeField === null ? -1 : fields.indexOf(activeField);
        const next = key.shift ? (index <= 0 ? fields.length - 1 : index - 1) : (index + 1) % fields.length;
        setActiveField(fields[next] ?? 'id');
        return;
      }
      if (key.escape) {
        onCancel();
        return;
      }
      if (key.return) {
        submit();
        return;
      }
      if (input === 't') cycleType();
      else if (input === 'o' && isLifecycle) cycleOp();
      else if (isPrune && (input === '1' || input === '2' || input === '3')) {
        const scope = SCOPE_OPTIONS[Number(input) - 1]?.value;
        if (scope !== undefined) toggleScopeValue(scope);
      }
    },
    { isActive: activeField === null }
  );

  return (
    <EditingGuard isEditing={activeField !== null}>
      <Box flexDirection='column' gap={0}>
        <Text bold>{initial.id === '' ? 'New job' : `Edit job ${initial.id}`}</Text>

        <Text dimColor>id (lowercase-digits-dashes)</Text>
        {activeField === 'id' ? (
          <TextInput
            defaultValue={values.id}
            placeholder='nightly-prune'
            onChange={id => setValues(previous => ({ ...previous, id }))}
            onSubmit={() => setActiveField(null)}
          />
        ) : (
          <Text> {values.id === '' ? '—' : values.id}</Text>
        )}
        {errors.id !== undefined && <Text color='red'> {errors.id}</Text>}

        <Text>
          type: {values.type} <Text dimColor>(t to toggle)</Text>
        </Text>

        {isLifecycle && (
          <>
            <Text>
              op: {values.op} <Text dimColor>(o to cycle)</Text>
            </Text>
            <Text dimColor>stack dir</Text>
            {activeField === 'stackDir' ? (
              <TextInput
                defaultValue={values.stackDir}
                placeholder='/srv/stacks/caddy'
                onChange={stackDir => setValues(previous => ({ ...previous, stackDir }))}
                onSubmit={() => setActiveField(null)}
              />
            ) : (
              <Text> {values.stackDir === '' ? '—' : values.stackDir}</Text>
            )}
            {errors.stackDir !== undefined && <Text color='red'> {errors.stackDir}</Text>}
          </>
        )}

        {isPrune && (
          <>
            <Text dimColor>scopes — 1/2/3 toggles; unsafe scopes do not exist in this list</Text>
            {SCOPE_OPTIONS.map((option, index) => (
              <Text key={option.value}>
                {' '}
                {values.scopes.includes(option.value) ? '[x]' : '[ ]'} ({index + 1}) {option.label}
              </Text>
            ))}
            {errors.scopes !== undefined && <Text color='red'> {errors.scopes}</Text>}
          </>
        )}

        <Text dimColor>schedule (5-field cron, server local time)</Text>
        {activeField === 'cron' ? (
          <TextInput
            defaultValue={values.cron}
            placeholder='0 4 * * *'
            onChange={cron => setValues(previous => ({ ...previous, cron }))}
            onSubmit={() => setActiveField(null)}
          />
        ) : (
          <Text> {values.cron === '' ? '—' : values.cron}</Text>
        )}
        {errors.cron !== undefined && <Text color='red'> {errors.cron}</Text>}

        <Box height={1} />
        <Text dimColor>
          tab fields · enter submit · esc cancel
          {activeField !== null ? ' · enter confirms field' : ' · t/o/1-3 quick edits'}
        </Text>
      </Box>
    </EditingGuard>
  );
}
