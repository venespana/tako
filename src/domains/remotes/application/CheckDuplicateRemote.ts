// CheckDuplicateRemote.ts — use case (GREEN phase)
import type { RemoteRepository } from './RemoteRepository.js';
import { toEndpoint } from '../domain/endpoint.js';
import type { DuplicateResult, RemoteDraft } from '../domain/types.js';

export class CheckDuplicateRemote {
  constructor(private readonly repo: RemoteRepository) {}

  /**
   * Check whether a RemoteDraft collides with an existing remote by name
   * or by endpoint (user@host:port). Returns the first collision found.
   * Name is checked before endpoint per D4 (hard block, name takes priority).
   */
  async check(draft: RemoteDraft): Promise<DuplicateResult> {
    const nameExists = await this.repo.existsByName(draft.name);
    if (nameExists) {
      return { isDuplicate: true, kind: 'name' };
    }

    const endpoint = toEndpoint(draft);
    const endpointExists = await this.repo.existsByEndpoint(endpoint);
    if (endpointExists) {
      return { isDuplicate: true, kind: 'endpoint' };
    }

    return { isDuplicate: false };
  }
}
