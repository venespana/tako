// editing-context.tsx — Tracks whether a text input is currently active.
// When true, global key handlers (useGlobalKeys) disable themselves so that
// h/j/k/l characters reach the text input without being intercepted.
import { createContext, useContext } from 'react';

interface EditingContextValue {
  isEditing: boolean;
  setEditing: (value: boolean) => void;
}

export const EditingContext = createContext<EditingContextValue>({
  isEditing: false,
  setEditing: () => {},
});

export function useEditing(): EditingContextValue {
  return useContext(EditingContext);
}
