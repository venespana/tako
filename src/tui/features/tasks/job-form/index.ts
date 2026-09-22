// features/tasks/job-form/index.ts — Public API of the job-form slice.
export { JobForm } from './ui/JobForm.js';
export type { JobFormProps } from './ui/JobForm.js';
export {
  EMPTY_JOB_FORM,
  LIFECYCLE_OP_OPTIONS,
  SCOPE_OPTIONS,
  buildJobDefinition,
  jobToForm,
  toggleScope,
  validateJobForm,
} from './model/job-form.js';
export type { JobFormType, JobFormValues, JobFormErrors } from './model/job-form.js';
