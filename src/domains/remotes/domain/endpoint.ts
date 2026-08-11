// endpoint.ts — SSH endpoint string helper
import type { RemoteDraft } from './types.js';

/** Convert a RemoteDraft to "user@host:port" string */
export function toEndpoint(draft: RemoteDraft): string {
  return `${draft.username}@${draft.host}:${draft.port}`;
}
