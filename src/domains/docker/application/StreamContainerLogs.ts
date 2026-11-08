// StreamContainerLogs.ts — use case: live container log streaming via a port
// (tui-live-logs T1).
//
// Validates the container name against the docker-safe pattern BEFORE the
// request reaches any shell — the name is the one piece of caller input in
// the remote command and is never interpolated unchecked — then delegates to
// the ContainerLogStreamer port. Acquisition failures (SSH connect, channel
// open) are DATA: a refusal carrying the reason. Once a handle exists,
// transport failures surface through its iterator instead.
//
// The port is declared here (application owns its ports);
// infrastructure/RemoteDockerLogsAdapter.ts is its sole production consumer,
// mirroring the GetContainers layering.

/** One live log stream: the caller consumes lines and stops it when done. */
export interface ContainerLogStreamHandle {
  /** Complete UTF-8 lines as they arrive. Single consumer per handle. */
  readonly lines: AsyncIterable<string>;
  /** Stop following: closes the remote channel. Idempotent. */
  stop(): Promise<void>;
  /**
   * 'stopped' once stop() ran; 'ended' when the remote `docker logs` process
   * exits on its own (e.g. the container stopped). A transport error throws
   * through `lines` instead — the remote side is gone either way, so done
   * also settles 'ended' to leave no waiter behind.
   */
  readonly done: Promise<'stopped' | 'ended'>;
}

/** Port: follow one container's logs on the target host. */
export interface ContainerLogStreamer {
  stream(request: { readonly container: string; readonly tail: number }): Promise<ContainerLogStreamHandle>;
}

/** Outcome: a live stream handle, or a refusal naming why there is none. */
export type StreamContainerLogsResult =
  | { readonly kind: 'ok'; readonly stream: ContainerLogStreamHandle }
  | { readonly kind: 'refusal'; readonly reason: string };

/** Docker-safe container name: starts alphanumeric, then [A-Za-z0-9_.-]. */
export const CONTAINER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/** `--tail` bounds: at least one line, at most docker's own cap (10000 =
 * all lines). The tail interpolates into the remote command just like the
 * name, so it is bounded at the same gate, before the port is touched. */
const MIN_LOG_TAIL = 1;
const MAX_LOG_TAIL = 10_000;

const isValidTail = (tail: number): boolean => Number.isInteger(tail) && tail >= MIN_LOG_TAIL && tail <= MAX_LOG_TAIL;

/** Use case: stream one container's logs (name validated in-domain first). */
export class StreamContainerLogs {
  constructor(private readonly streamer: ContainerLogStreamer) {}

  async execute(request: { readonly container: string; readonly tail: number }): Promise<StreamContainerLogsResult> {
    if (!CONTAINER_NAME_PATTERN.test(request.container)) {
      return { kind: 'refusal', reason: `invalid container name "${request.container}"` };
    }

    if (!isValidTail(request.tail)) {
      return {
        kind: 'refusal',
        reason: `invalid tail ${request.tail} (expected an integer from ${MIN_LOG_TAIL} to ${MAX_LOG_TAIL})`,
      };
    }

    try {
      return { kind: 'ok', stream: await this.streamer.stream(request) };
    } catch (error) {
      return { kind: 'refusal', reason: error instanceof Error ? error.message : String(error) };
    }
  }
}
