// EditingGuard.tsx — Disables global key handlers (vim shortcuts like h/j/k/l)
// while a text input is active. Wraps any text-input-consuming component.
import { useEffect } from 'react';
import { useEditing } from '../../shared/lib/editing-context.js';

interface EditingGuardProps {
  children: React.ReactElement;
  /** When true, global keys are blocked. */
  isEditing: boolean;
}

export function EditingGuard({ children, isEditing }: EditingGuardProps): React.ReactElement {
  const { setEditing } = useEditing();

  useEffect(() => {
    setEditing(isEditing);
    return () => setEditing(false);
  }, [isEditing, setEditing]);

  return children;
}
