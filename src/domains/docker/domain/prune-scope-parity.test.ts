// domain/prune-scope-parity.test.ts — mechanical parity witness (task 9.7)
//
// `agent/domain`'s `PruneScopes` union and `docker/domain`'s `PruneScope`
// union are intentionally identical, member-wise, per ADR-0008 (the agent
// mirrors the docker domain's closed safe-prune taxonomy; ADR-0015 forbids a
// runtime import between the domains, so the two unions exist side by side).
// Until today the parity was enforced only by review — a member added on one
// side drifted silently and surfaced only as a runtime rejection. This test
// pins BOTH directions: the two type-annotated assignments fail `tsc` if
// either union gains or loses a member, and the runtime equality fails the
// suite if the two runtime lists diverge. The cross-domain import IS the
// point of this witness test and stays confined here.
import { describe, expect, it } from 'vitest';

import { PRUNE_SCOPES as DOCKER_PRUNE_SCOPES, type PruneScope } from './types.js';
import { PRUNE_SCOPES as AGENT_PRUNE_SCOPES, type PruneScopes } from '../../agent/domain/types.js';

describe('agent ↔ docker prune scope parity (9.7)', () => {
  it('agent/domain PruneScopes and docker/domain PruneScope are member-wise identical', () => {
    // Docker's runtime list must be assignable to the agent's union…
    const dockerAsAgent: readonly PruneScopes[] = DOCKER_PRUNE_SCOPES;
    // …and the agent's runtime list must be assignable to docker's union.
    const agentAsDocker: readonly PruneScope[] = AGENT_PRUNE_SCOPES;

    expect([...dockerAsAgent]).toEqual([...AGENT_PRUNE_SCOPES]);
    expect([...agentAsDocker]).toEqual([...DOCKER_PRUNE_SCOPES]);
    // Canonical order is part of the contract (stable user-facing lists).
    expect(DOCKER_PRUNE_SCOPES).toEqual(AGENT_PRUNE_SCOPES);
  });
});
