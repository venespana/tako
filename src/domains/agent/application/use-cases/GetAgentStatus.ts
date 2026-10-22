// GetAgentStatus.ts — use case: one-shot agent status probe + lifecycle mapping (task 3.10)
//
// `computeAgentLifecycle` is the pure classifier behind TUI badges (design
// §Job & Run Model client view). The class is the one-shot CLI probe: it
// connects, queries `agent.status`, and closes the session; long-lived
// consumers (TUI) use ConnectAgent and keep the session.
import type { AgentStatusResult } from '../../domain/protocol.js';
import type { AgentLifecycle } from '../../domain/types.js';
import type { AgentTransport } from '../AgentTransport.js';

export interface LifecycleInput {
  readonly connected: boolean;
  /** False when the handshake produced a version/protocol warning. */
  readonly protocolMatch: boolean;
  /** Raw systemd unit state from the agent ('active', 'not-found', …). */
  readonly unitState?: string;
}

export function computeAgentLifecycle(input: LifecycleInput): AgentLifecycle {
  if (!input.connected) return 'unreachable';

  if (!input.protocolMatch) return 'version_mismatch';

  if (input.unitState === 'active') return 'active';

  if (input.unitState === 'not-found') return 'not_installed';

  return 'inactive_unit';
}

export class GetAgentStatus {
  constructor(private readonly transport: AgentTransport) {}

  /** One-shot probe: connect → agent.status → close. */
  async execute(): Promise<AgentStatusResult> {
    const session = await this.transport.connect();

    try {
      return await session.request('agent.status', {});
    } finally {
      await session.close();
    }
  }
}
