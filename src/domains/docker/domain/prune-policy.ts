// domain/prune-policy.ts — closed-union scope guard + docker filter mapping (task 5.2)
//
// ADR-0008: volume prune and all-images prune (`image prune -af`) must be
// rejected STRUCTURALLY — the union is closed, this validator rejects
// everything outside it, and the filter mapping below makes `-af`
// unrepresentable (the dangling filter is pinned; no `all` flag exists here).
// Pure module — shared by the dry-run plan and the apply path (task 5.4).

import { PRUNE_SCOPES } from './types.js';
import type { DockerFilters, PruneScope } from './types.js';

/** Container statuses considered "stopped" (never `running`, never `paused`). */
export const STOPPED_CONTAINER_STATUSES = ['created', 'exited', 'dead'] as const;

/** Validation failure naming the offending scope input in `reason`. */
export class PruneScopeValidationError extends Error {
  /** Which part of the scope input was rejected. */
  readonly reason: string;

  constructor(reason: string) {
    super(`invalid prune scopes: ${reason}`);
    this.name = 'PruneScopeValidationError';
    this.reason = reason;
  }
}

/** True when `value` is a member of the closed ADR-0008 union. */
export function isValidPruneScope(value: unknown): value is PruneScope {
  return typeof value === 'string' && (PRUNE_SCOPES as readonly string[]).includes(value);
}

/**
 * Validate an untrusted scope set into {@link PruneScope}[], preserving
 * first-occurrence order and collapsing duplicates. Shared gate for dry-run
 * and apply: a forbidden scope (volume prune, all-images prune, typos,
 * non-strings) fails the whole set — no partial passes.
 *
 * @throws PruneScopeValidationError naming the first offending element.
 */
export function parsePruneScopes(value: unknown): PruneScope[] {
  if (!Array.isArray(value)) {
    throw new PruneScopeValidationError(`expected a non-empty array of scopes, got ${typeof value}`);
  }

  if (value.length === 0) {
    throw new PruneScopeValidationError('scope set is empty');
  }

  const parsed: PruneScope[] = [];

  value.forEach(element => {
    if (!isValidPruneScope(element)) {
      throw new PruneScopeValidationError(
        `scope ${JSON.stringify(element ?? null)} is outside the closed union (${PRUNE_SCOPES.join('|')})`
      );
    }

    if (!parsed.includes(element)) {
      parsed.push(element);
    }
  });

  return parsed;
}

/**
 * Docker prune filters for one scope. The dangling-images scope pins
 * `dangling: ["true"]` — the apply endpoint can never behave like
 * `image prune -af`. Stopped containers need no filter: the container prune
 * endpoint is stopped-only by construction. Build cache never sets the `all`
 * flag: POST /build/prune without `all` matches `docker builder prune -f`.
 */
export function dockerPruneFilters(scope: PruneScope): DockerFilters {
  switch (scope) {
    case 'dangling-images':
      return { dangling: ['true'] };
    case 'stopped-containers':
    case 'build-cache':
      return {};
  }
}

/** Listing filters that select exactly the stopped containers (dry-run plan). */
export function stoppedContainersListFilters(): DockerFilters {
  return { status: [...STOPPED_CONTAINER_STATUSES] };
}
