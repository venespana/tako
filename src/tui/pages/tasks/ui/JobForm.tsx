// pages/tasks/ui/JobForm.tsx — create/edit job form (task 8.6,
// reworked by 9.15b to the AddRemoteWizard progressive-disclosure pattern):
// ONE field at a time (id → type → the chosen type's branch → schedule), the
// first field focused on entry, each step confirmed with Enter, completed
// fields collapsed into one-line done rows. The quick-edit char bindings
// (t/o/1-3) are GONE — 9.15c: with the form open, character keys are data
// entry for the focused input alone, and Esc is the ONLY cancel (bound below;
// EditingGuard keeps the app-level/global handlers off while the form is
// open). The Select/MultiSelect steps commit on their own Enter handling, so
// the form binds no Enter of its own — a keypress is never processed twice.
// Validation feedback stays the model's validateJobForm: an invalid step
// cannot be confirmed, so submit is only reachable with a fully valid form.
import { useCallback, useMemo, useState } from 'react';

import { Box, Text } from 'ink';

import { MultiSelect, Select, TextInput } from '@inkjs/ui';

import { DoneRow } from './DoneRow.js';
import type { JobDefinition, StackLifecycleOp, PruneScopes } from '../../../../services/agent.js';
import { useKeyBindings } from '../../../shared/lib/use-key-bindings.js';
import { EditingGuard } from '../../../shared/ui/EditingGuard.js';
import {
  LIFECYCLE_OP_OPTIONS,
  SCOPE_OPTIONS,
  buildJobDefinition,
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

/** The wizard steps; the type step decides which branch follows it. */
type Step = 'id' | 'type' | 'op' | 'stackDir' | 'scopes' | 'schedule';

/** Steps revealed after the type step, per job type. */
function stepsForType(type: JobFormType): Step[] {
  return type === 'prune' ? ['scopes', 'schedule'] : ['op', 'stackDir', 'schedule'];
}

const STEP_LABELS: Record<Step, string> = {
  id: 'id:',
  type: 'type:',
  op: 'op:',
  stackDir: 'stack dir:',
  scopes: 'scopes:',
  schedule: 'schedule:',
};

/** Value a completed step shows on its done row. */
function doneValue(step: Step, values: JobFormValues): string {
  switch (step) {
    case 'id':
      return values.id === '' ? '—' : values.id;
    case 'type':
      return values.type;
    case 'op':
      return values.op;
    case 'stackDir':
      return values.stackDir === '' ? '—' : values.stackDir;
    case 'scopes':
      return values.scopes.length === 0 ? '—' : values.scopes.join(', ');
    case 'schedule':
      return values.cron;
  }
}

// Select steps follow the AddRemoteWizard pattern: NO defaultValue — the
// component's Enter handler only fires onChange when the committed value
// CHANGES, so seeding it would make "Enter keeps the current value" a no-op.
// The current value is offered FIRST instead: Select always highlights its
// first option, so plain Enter keeps the existing choice and the arrow keys
// switch it (edit-friendly; create starts on the canonical default).
function typeOptions(current: JobFormType): { label: string; value: JobFormType }[] {
  const prune = { label: 'prune — safe scopes only', value: 'prune' as const };
  const lifecycle = {
    label: 'stack-lifecycle — up/down/pull/restart one stack',
    value: 'stack-lifecycle' as const,
  };
  return current === 'prune' ? [prune, lifecycle] : [lifecycle, prune];
}

function opOptions(current: StackLifecycleOp): { label: string; value: StackLifecycleOp }[] {
  const currentOption = LIFECYCLE_OP_OPTIONS.find(option => option.value === current);
  const rest = LIFECYCLE_OP_OPTIONS.filter(option => option.value !== current);
  return currentOption === undefined ? [...rest] : [currentOption, ...rest];
}

export function JobForm({ initial, onCancel, onSubmit }: JobFormProps): React.ReactElement {
  const [values, setValues] = useState<JobFormValues>(initial);
  const [step, setStep] = useState<Step>('id');
  const errors = useMemo(() => validateJobForm(values), [values]);

  // Esc is the ONLY cancel (9.15c). Deliberately NO char bindings and no Tab
  // navigation: one field is active at a time, so there is nothing to cycle.
  useKeyBindings({ cancel: onCancel }, { isActive: true });

  // STABLE onChange handlers (9.10): @inkjs/ui's TextInput re-runs its onChange
  // effect whenever the handler identity changes — inline arrows here would
  // loop onChange → setState → re-render → onChange while typing.
  const onIdChange = useCallback((id: string) => setValues(previous => ({ ...previous, id })), []);
  const onStackDirChange = useCallback((stackDir: string) => setValues(previous => ({ ...previous, stackDir })), []);
  const onCronChange = useCallback((cron: string) => setValues(previous => ({ ...previous, cron })), []);
  const onScopesChange = useCallback(
    (scopes: string[]) => setValues(previous => ({ ...previous, scopes: scopes as PruneScopes[] })),
    []
  );
  // Select commits on Enter; the type commit also opens the type's branch.
  const onTypeChange = useCallback((value: string) => {
    const type = value as JobFormType;
    setValues(previous => ({ ...previous, type }));
    setStep(stepsForType(type)[0] ?? 'schedule');
  }, []);
  const onOpChange = useCallback((value: string) => {
    setValues(previous => ({ ...previous, op: value as StackLifecycleOp }));
    setStep('stackDir');
  }, []);

  const submit = useCallback((): void => {
    const job = buildJobDefinition(values);

    if (job === null) return; // unreachable: every step gates its own error

    onSubmit(job);
  }, [values, onSubmit]);

  const confirmId = useCallback((): void => {
    if (errors.id === undefined) setStep('type');
  }, [errors.id]);
  const confirmStackDir = useCallback((): void => {
    if (errors.stackDir === undefined) setStep('schedule');
  }, [errors.stackDir]);
  const confirmScopes = useCallback((): void => {
    if (errors.scopes === undefined) setStep('schedule');
  }, [errors.scopes]);
  const confirmSchedule = useCallback((): void => {
    if (errors.cron === undefined) submit();
  }, [errors.cron, submit]);

  // Reveal order for the CURRENT type; done rows are everything before step.
  const order = useMemo<readonly Step[]>(() => ['id', 'type', ...stepsForType(values.type)], [values.type]);
  const stepIndex = order.indexOf(step);
  const doneSteps = order.slice(0, stepIndex);

  return (
    <EditingGuard isEditing={true}>
      <Box flexDirection='column' gap={0}>
        <Text bold>{initial.id === '' ? 'New job' : `Edit job ${initial.id}`}</Text>

        {doneSteps.map(done => (
          <DoneRow key={done} label={STEP_LABELS[done]} value={doneValue(done, values)} />
        ))}

        {step === 'id' && (
          <Box flexDirection='column'>
            <Text>Job id (lowercase letters, digits, inner dashes):</Text>
            <TextInput
              defaultValue={values.id}
              placeholder='nightly-prune'
              onChange={onIdChange}
              onSubmit={confirmId}
            />
            {errors.id !== undefined && <Text color='red'> {errors.id}</Text>}
          </Box>
        )}

        {step === 'type' && (
          <Box flexDirection='column'>
            <Text>Job type:</Text>
            <Select options={typeOptions(values.type)} onChange={onTypeChange} />
          </Box>
        )}

        {step === 'op' && (
          <Box flexDirection='column'>
            <Text>Operation:</Text>
            <Select options={opOptions(values.op)} onChange={onOpChange} />
          </Box>
        )}

        {step === 'stackDir' && (
          <Box flexDirection='column'>
            <Text>Compose stack directory:</Text>
            <TextInput
              defaultValue={values.stackDir}
              placeholder='/srv/stacks/caddy'
              onChange={onStackDirChange}
              onSubmit={confirmStackDir}
            />
            {errors.stackDir !== undefined && <Text color='red'> {errors.stackDir}</Text>}
          </Box>
        )}

        {step === 'scopes' && (
          <Box flexDirection='column'>
            <Text>Prune scopes (at least one):</Text>
            <MultiSelect
              defaultValue={values.scopes}
              options={[...SCOPE_OPTIONS]}
              onChange={onScopesChange}
              onSubmit={confirmScopes}
            />
            {errors.scopes !== undefined && <Text color='red'> {errors.scopes}</Text>}
          </Box>
        )}

        {step === 'schedule' && (
          <Box flexDirection='column'>
            <Text>Schedule (5-field cron, server local time):</Text>
            <TextInput
              defaultValue={values.cron}
              placeholder='0 4 * * *'
              onChange={onCronChange}
              onSubmit={confirmSchedule}
            />
            {errors.cron !== undefined && <Text color='red'> {errors.cron}</Text>}
          </Box>
        )}
      </Box>
    </EditingGuard>
  );
}
