// StreamStackLogs.ts — use case: live compose stack log streaming via a port
// (T1-cli-logs).
//
// Validates the stack name against the compose-project grammar BEFORE the
// request reaches any shell — the name is the one piece of caller input in
// the remote command and is never interpolated unchecked — then delegates
// to the StackLogStreamer port. Acquisition failures (SSH connect, channel
// open) are DATA: a refusal carrying the reason (loud-refusal convention).
// Once a handle exists, transport failures surface through its iterator.
//
// The port is declared here (application owns its ports);
// infrastructure/RemoteComposeLogsAdapter.ts is its sole production
// consumer, mirroring the StreamContainerLogs layering. The stream handle
// is the same contract as the container path (lines / stop / done), so the
// service layer's connection-owning wrapper serves both.
import type { ContainerLogStreamHandle } from './StreamContainerLogs.js';
import { isValidStackName } from '../domain/stack-logs.js';

/** One live log stream: the caller consumes lines and stops it when done. */
export type StackLogStreamHandle = ContainerLogStreamHandle;

export type { ContainerLogStreamHandle };

/** Port: follow one compose stack's logs on the target host. */
export interface StackLogStreamer {
  stream(request: { readonly stack: string; readonly follow: boolean }): Promise<StackLogStreamHandle>;
}

/** Outcome: a live stream handle, or a refusal naming why there is none. */
export type StreamStackLogsResult =
  | { readonly kind: 'ok'; readonly stream: StackLogStreamHandle }
  | { readonly kind: 'refusal'; readonly reason: string };

/** Use case: stream one compose stack's logs (name validated in-domain first). */
export class StreamStackLogs {
  constructor(private readonly streamer: StackLogStreamer) {}

  async execute(request: { readonly stack: string; readonly follow: boolean }): Promise<StreamStackLogsResult> {
    if (!isValidStackName(request.stack)) {
      return { kind: 'refusal', reason: `invalid stack name "${request.stack}"` };
    }

    try {
      return { kind: 'ok', stream: await this.streamer.stream(request) };
    } catch (error) {
      return { kind: 'refusal', reason: error instanceof Error ? error.message : String(error) };
    }
  }
}
