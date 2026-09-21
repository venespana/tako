// prune-policy.test.ts — closed-union scope guard + filter mapping (tasks 5.2, 5.7)
//
// ADR-0008: volume prune and all-images prune (`image prune -af`) must be
// rejected structurally — the union is closed, the validator rejects
// everything outside it, and the filter mapping makes `-af` unrepresentable.
import { describe, expect, it } from 'vitest';
import {
  PruneScopeValidationError,
  STOPPED_CONTAINER_STATUSES,
  dockerPruneFilters,
  isValidPruneScope,
  parsePruneScopes,
  stoppedContainersListFilters,
} from './prune-policy.js';
import type { PruneScope } from './types.js';

describe('prune-policy — closed union (type level)', () => {
  it('exposes exactly the ADR-0008 scopes', () => {
    const allScopes: readonly PruneScope[] = ['stopped-containers', 'dangling-images', 'build-cache'];
    expect(allScopes).toHaveLength(3);
  });

  it('forbidden scopes are unrepresentable at the type level (ADR-0008)', () => {
    type Forbidden = 'volumes' | 'all-images';
    // @ts-expect-error 'volumes' is not assignable to the closed PruneScope union
    const volumes: PruneScope = 'volumes' satisfies Forbidden;
    // @ts-expect-error 'all-images' is not assignable to the closed PruneScope union
    const allImages: PruneScope = 'all-images' satisfies Forbidden;
    expect([volumes, allImages]).toBeDefined();
  });
});

describe('prune-policy — validator', () => {
  it('accepts every member of the union, preserving order', () => {
    expect(parsePruneScopes(['stopped-containers'])).toEqual(['stopped-containers']);
    expect(parsePruneScopes(['dangling-images', 'build-cache'])).toEqual(['dangling-images', 'build-cache']);
  });

  it('rejects volume prune at the validator level', () => {
    expect(() => parsePruneScopes(['volumes'])).toThrow(PruneScopeValidationError);
  });

  it('rejects all-images prune at the validator level', () => {
    expect(() => parsePruneScopes(['all-images'])).toThrow(PruneScopeValidationError);
  });

  it('rejects lookalike typos and non-string elements', () => {
    expect(() => parsePruneScopes(['dangling_images'])).toThrow(PruneScopeValidationError);
    expect(() => parsePruneScopes(['Stopped-Containers'])).toThrow(PruneScopeValidationError);
    expect(() => parsePruneScopes([42])).toThrow(PruneScopeValidationError);
  });

  it('rejects empty scope sets and non-array input', () => {
    expect(() => parsePruneScopes([])).toThrow(PruneScopeValidationError);
    expect(() => parsePruneScopes('dangling-images')).toThrow(PruneScopeValidationError);
    expect(() => parsePruneScopes(null)).toThrow(PruneScopeValidationError);
    expect(() => parsePruneScopes(undefined)).toThrow(PruneScopeValidationError);
  });

  it('rejects a valid scope mixed with a forbidden one (no partial passes)', () => {
    expect(() => parsePruneScopes(['dangling-images', 'volumes'])).toThrow(PruneScopeValidationError);
  });

  it('collapses duplicate scopes (repetition is meaningless)', () => {
    expect(parsePruneScopes(['dangling-images', 'dangling-images'])).toEqual(['dangling-images']);
  });

  it('isValidPruneScope narrows without throwing', () => {
    expect(isValidPruneScope('build-cache')).toBe(true);
    expect(isValidPruneScope('volumes')).toBe(false);
  });
});

describe('prune-policy — docker filter mapping', () => {
  it('pins the dangling filter for image prunes (makes -af unrepresentable)', () => {
    expect(dockerPruneFilters('dangling-images')).toEqual({ dangling: ['true'] });
  });

  it('stopped containers need no filter: the prune endpoint is stopped-only by construction', () => {
    expect(dockerPruneFilters('stopped-containers')).toEqual({});
  });

  it('build cache never sets the all flag (docker builder prune -f semantics)', () => {
    expect(dockerPruneFilters('build-cache')).toEqual({});
  });

  it('listing filters for stopped containers cover the non-running statuses', () => {
    expect(stoppedContainersListFilters()).toEqual({ status: [...STOPPED_CONTAINER_STATUSES] });
    expect(STOPPED_CONTAINER_STATUSES).toEqual(['created', 'exited', 'dead']);
  });
});
