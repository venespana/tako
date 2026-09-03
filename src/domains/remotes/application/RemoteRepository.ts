// RemoteRepository.ts — PORT interface (application layer owns this)
import type { Remote, RemoteSummary } from '../domain/types.js';

/** Port: persistence for remote connections */
export interface RemoteRepository {
  /** Check if a remote with this name already exists */
  existsByName(name: string): Promise<boolean>;
  /** Check if a remote with this endpoint already exists */
  existsByEndpoint(endpoint: string): Promise<boolean>;
  /** Persist a remote (caller is responsible for ensuring no duplicates) */
  save(remote: Remote): Promise<void>;
  /** List all configured remotes (name + endpoint only, sorted by name) */
  list(): Promise<RemoteSummary[]>;
}
