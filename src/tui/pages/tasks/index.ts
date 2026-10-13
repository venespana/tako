// pages/tasks/index.ts — Public API of the tasks page slice (FSD rule 4-2):
// app/ routes and the test utilities import from here, never from the
// slice's internal segments. The page absorbed the former single-use
// features/tasks slices (ADR-0018: one consumer → the code lives in the
// consumer); its components and models are internal. Transport, install,
// and cursor come from the services layer — the page exports no gateway.
export { TasksPage } from './ui/TasksPage.js';
export { resetTasksStoreForTests, useTasksStore } from './model/tasks-store.js';
