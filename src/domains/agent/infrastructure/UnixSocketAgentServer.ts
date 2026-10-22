// infrastructure/UnixSocketAgentServer.ts — agent-mode socket server (task 4.3)
//
// node:net server on ~/.tako/agent.sock serving the WU3 protocol (design
// §Protocol): 0600 socket owned by the user (SSH identity IS the auth),
// stale-socket recovery on bind, CRASH RECOVERY BEFORE SERVING (stale
// pending/running runs are marked failed — the boot-time exception to the
// run state machine, which governs the execution path only), then request
// routing to the WU3 use cases plus agent.status, and push-event broadcast.
//
// Framing: newline-delimited JSON, one frame per line (the same convention
// as the WU2 AgentChannel adapters); partial UTF-8 chunks are handled with
// StringDecoder, and the remainder is flushed as a final frame on close
// (WU2 verifier findings — flush buffered frames, no dropped tails).
import { randomUUID } from 'node:crypto';
import { chmodSync, statSync, unlinkSync } from 'node:fs';
import { connect, createServer, type Server, type Socket } from 'node:net';
import { StringDecoder } from 'node:string_decoder';

import type { Clock } from '../application/Clock.js';
import type { JobStore } from '../application/JobStore.js';
import { DeleteJob } from '../application/use-cases/DeleteJob.js';
import { GetJobHistory } from '../application/use-cases/GetJobHistory.js';
import { ListJobs } from '../application/use-cases/ListJobs.js';
import { ReconcileState } from '../application/use-cases/ReconcileState.js';
import { JobNotFoundError } from '../application/use-cases/TriggerJob.js';
import { UpsertJob } from '../application/use-cases/UpsertJob.js';
import { JobValidationError } from '../domain/job.js';
import {
  MAX_FRAME_BYTES,
  PROTOCOL_VERSION,
  decodeFrame,
  encodeFrame,
  errorFrame,
  helloAckFrame,
  protocolWarningFrame,
  responseFrame,
  type AgentFrame,
  type ProtocolErrorCode,
} from '../domain/protocol.js';
import type { RunMode, RunView, Slug } from '../domain/types.js';

/** Host-side facts only the composition root can know (systemd/linger/meta). */
export interface AgentHostStatus {
  readonly unitState: string;
  readonly linger: boolean;
  readonly lingerByTako: boolean;
}

export interface UnixSocketAgentServerOptions {
  /** Absolute socket path (e.g. /home/ops/.tako/agent.sock). */
  readonly socketPath: string;
  readonly agentVersion: string;
  readonly store: JobStore;
  readonly clock: Clock;
  /** Host-side status fields for agent.status (systemd, linger, meta). */
  readonly status: () => Promise<AgentHostStatus>;
  /**
   * Task 8.0: create the triggered run and queue it on the engine's serial
   * drain (RunSchedulerLoop.enqueueTriggered). The server NEVER creates or
   * executes runs inline in the connection handler — the callback resolves
   * with the queued (pending) run view that the response returns.
   */
  readonly trigger: (jobId: Slug, mode: RunMode) => Promise<RunView>;
}

interface ConnectionContext {
  readonly socket: Socket;
  readonly decoder: StringDecoder;
  buffer: string;
  handshakeDone: boolean;
}

const STALE_RUN_RESULT = { error: 'agent restarted before this run finished' } as const;

export class UnixSocketAgentServer {
  readonly #options: UnixSocketAgentServerOptions;
  readonly #server: Server;
  readonly #connections = new Set<ConnectionContext>();
  readonly #startedAt: Date;
  readonly #agentStartId: string;

  constructor(options: UnixSocketAgentServerOptions) {
    this.#options = options;
    this.#startedAt = options.clock.now();
    this.#agentStartId = randomUUID();
    this.#server = createServer(socket => this.#handleConnection(socket));
  }

  /**
   * Crash recovery FIRST (spec/design: stale runs never survive as pending/
   * running), then bind. A stale socket file left by a crashed agent is
   * removed after confirming no live agent is behind it; a LIVE agent makes
   * the start fail explicitly.
   */
  async start(): Promise<void> {
    await this.#recoverStaleRuns();

    await new Promise<void>((resolve, reject) => {
      const onError = async (error: Error & { code?: string }) => {
        if (error.code !== 'EADDRINUSE') {
          reject(error);
          return;
        }

        if (await this.#isSocketLive()) {
          reject(new Error(`another agent is already listening on ${this.#options.socketPath}`));
          return;
        }

        try {
          unlinkSync(this.#options.socketPath);
        } catch {
          // Nothing to clean — the bind error is about to resurface.
        }

        this.#server.once('error', reject);
        this.#listen(resolve);
      };
      this.#server.once('error', onError);
      this.#listen(() => {
        this.#server.removeListener('error', onError);
        resolve();
      });
    });

    // The socket file is the auth boundary (design D1): owner-only. Tighten
    // umask BEFORE binding so the inode is never world/group readable, then
    // chmod as belt-and-braces. A chmod failure is fatal — running with a
    // permissive socket would silently defeat SSH-identity authentication.
    const previousUmask = process.umask(0o077);

    try {
      chmodSync(this.#options.socketPath, 0o600);
    } catch (error) {
      await this.stop();
      throw new Error(
        `cannot restrict agent socket ${this.#options.socketPath} to 0600 — refusing to serve (auth model requires an owner-only socket)`,
        { cause: error }
      );
    } finally {
      process.umask(previousUmask);
    }
  }

  /** Stop serving, drop every client, and unlink the socket file. */
  async stop(): Promise<void> {
    this.#connections.forEach(context => context.socket.destroy());

    this.#connections.clear();
    await new Promise<void>(resolve => {
      this.#server.close(() => resolve());
    });

    try {
      statSync(this.#options.socketPath);
      unlinkSync(this.#options.socketPath);
    } catch {
      // Already gone (e.g. rm'd externally) — stop is idempotent.
    }
  }

  /** Push an event frame (job.state_changed / run.completed) to every client. WU7 calls this. */
  broadcastEvent(frame: AgentFrame): void {
    this.#connections.forEach(context => this.#write(context, frame));
  }

  async #recoverStaleRuns(): Promise<void> {
    const { store, clock } = this.#options;
    const runs = await store.listRuns({});
    const finishedAt = clock.now().toISOString();

    await runs.reduce(async (chain, run) => {
      await chain;

      if (run.status === 'pending' || run.status === 'running') {
        await store.updateRun(run.id, { status: 'failed', finishedAt, result: STALE_RUN_RESULT });
      }
    }, Promise.resolve());
  }

  #listen(onListening: () => void): void {
    this.#server.listen({ path: this.#options.socketPath }, onListening);
  }

  async #isSocketLive(): Promise<boolean> {
    return new Promise(resolve => {
      const probe = connect(this.#options.socketPath);
      probe.once('connect', () => {
        probe.destroy();
        resolve(true);
      });
      probe.once('error', () => resolve(false));
    });
  }

  #handleConnection(socket: Socket): void {
    const context: ConnectionContext = {
      socket,
      decoder: new StringDecoder('utf8'),
      buffer: '',
      handshakeDone: false,
    };
    this.#connections.add(context);
    socket.on('data', chunk => this.#ingest(context, chunk as Buffer));
    socket.on('error', () => this.#drop(context));
    socket.on('close', () => this.#drop(context));
  }

  #drop(context: ConnectionContext): void {
    this.#connections.delete(context);

    if (!context.socket.destroyed) context.socket.destroy();
  }

  #ingest(context: ConnectionContext, chunk: Buffer): void {
    context.buffer += context.decoder.write(chunk);

    // Cap the pre-newline tail: a client that never sends a newline must not
    // grow memory without bound (decodeFrame's per-line cap can't see it yet).
    if (context.buffer.length > MAX_FRAME_BYTES) {
      // Report, let the error frame flush, then close: the client must learn
      // why the connection ended. The correlation id is salvaged best-effort
      // from the partial buffer so the client can fail the in-flight request.
      this.#write(
        context,
        errorFrame(
          'invalid_payload',
          `buffered frame exceeds ${MAX_FRAME_BYTES} bytes before newline`,
          salvageCorrelationId(context.buffer)
        )
      );
      context.socket.end();
      return;
    }

    this.#flushFrames(context);
  }

  /** Push every complete buffered frame; the tail stays buffered until more bytes arrive. */
  #flushFrames(context: ConnectionContext): void {
    let newlineIndex = context.buffer.indexOf('\n');

    while (newlineIndex !== -1) {
      const line = context.buffer.slice(0, newlineIndex);
      context.buffer = context.buffer.slice(newlineIndex + 1);
      this.#handleFrame(context, line);
      newlineIndex = context.buffer.indexOf('\n');
    }
  }

  #handleFrame(context: ConnectionContext, line: string): void {
    if (line.length === 0) return;

    let frame: AgentFrame;

    try {
      frame = decodeFrame(line);
    } catch (error) {
      // Oversize/bad JSON/shape errors are protocol-level invalid payloads;
      // the correlation id is salvaged best-effort so clients can fail fast.
      this.#write(
        context,
        errorFrame('invalid_payload', `malformed frame: ${describeError(error)}`, salvageCorrelationId(line))
      );
      return;
    }

    if (!context.handshakeDone) {
      this.#handleHandshake(context, frame);
      return;
    }

    this.#handlePostHandshake(context, frame);
  }

  #handleHandshake(context: ConnectionContext, frame: AgentFrame): void {
    if (frame.kind !== 'hello') {
      this.#write(context, errorFrame('invalid_payload', 'handshake: expected hello first'));
      return;
    }

    context.handshakeDone = true;
    const payload = (frame.payload ?? {}) as { clientVersion?: string; protocol?: number };
    this.#write(context, helloAckFrame(this.#options.agentVersion, this.#agentStartId));

    // Mismatch (either axis) → advisory warning event; the session continues.
    const clientVersion = payload.clientVersion ?? 'unknown';
    const protocolMismatch = payload.protocol !== undefined && payload.protocol !== PROTOCOL_VERSION;
    const versionMismatch = clientVersion !== this.#options.agentVersion;

    if (protocolMismatch || versionMismatch) {
      const detail = protocolMismatch
        ? `protocol version mismatch: client=${String(payload.protocol)} agent=${PROTOCOL_VERSION}`
        : `agent version differs from client: client=${clientVersion} agent=${this.#options.agentVersion} — re-run "tako agent install" to upgrade`;
      this.#write(context, protocolWarningFrame({ clientVersion, agentVersion: this.#options.agentVersion, detail }));
    }
  }

  #handlePostHandshake(context: ConnectionContext, frame: AgentFrame): void {
    if (frame.kind === 'request') {
      void this.#handleRequest(context, frame);
      return;
    }

    if (frame.kind === 'hello') {
      this.#write(context, errorFrame('invalid_payload', 'duplicate hello on an established session'));
      return;
    }

    // Events/responses/hello_ack FROM a client are protocol violations server-side.
    this.#write(context, errorFrame('invalid_payload', `unexpected ${frame.kind} frame to the agent`));
  }

  async #handleRequest(context: ConnectionContext, frame: AgentFrame): Promise<void> {
    if (frame.id === undefined) {
      this.#write(context, errorFrame('invalid_payload', 'request frames require a correlation id'));
      return;
    }

    try {
      const payload = await this.#route(frame.type, frame.payload);
      this.#write(context, responseFrame(frame.id, frame.type as 'agent.status', payload));
    } catch (error) {
      this.#write(context, errorFrame(toProtocolErrorCode(error), describeError(error), frame.id));
    }
  }

  /** Request table: dotted type → handler over the WU3 use cases / store. */
  async #route(type: string, payload: unknown): Promise<unknown> {
    switch (type) {
      case 'agent.status':
        return this.#agentStatus();
      case 'jobs.list':
        return { jobs: await new ListJobs(this.#options.store).execute() };
      case 'jobs.upsert':
        return new UpsertJob(this.#options.store).execute(payload);
      case 'jobs.delete': {
        const deleted = await new DeleteJob(this.#options.store).execute(readField(payload, 'jobId'));
        return { deleted };
      }
      case 'jobs.trigger': {
        const mode = readField(payload, 'mode');

        if (mode !== 'dry-run' && mode !== 'apply') {
          throw new JobValidationError(`mode must be 'dry-run' or 'apply', got ${JSON.stringify(mode)}`);
        }

        // Task 8.0: the trigger callback IS the engine's serial queue — the
        // response returns the queued (pending) run view.
        const run = await this.#options.trigger(readField(payload, 'jobId'), mode);
        return { run };
      }
      case 'jobs.history': {
        const jobId = readOptionalField(payload, 'jobId');
        const sinceSeq = readOptionalNumber(payload, 'sinceSeq');
        const limit = readOptionalNumber(payload, 'limit');
        return new GetJobHistory(this.#options.store).execute({
          ...(jobId !== undefined && { jobId }),
          ...(sinceSeq !== undefined && { sinceSeq }),
          ...(limit !== undefined && { limit }),
        });
      }
      case 'reconcile.sync':
        return new ReconcileState(this.#options.store).execute(readNumber(payload, 'lastSeq'));
      default:
        throw new UnknownRequestTypeError(type);
    }
  }

  async #agentStatus(): Promise<{
    agentVersion: string;
    protocol: number;
    uptimeSec: number;
    jobCount: number;
    unitState: string;
    linger: boolean;
    lingerByTako: boolean;
  }> {
    const jobs = await this.#options.store.listJobs();
    const host = await this.#options.status();
    return {
      agentVersion: this.#options.agentVersion,
      protocol: PROTOCOL_VERSION,
      uptimeSec: Math.floor((this.#options.clock.now().getTime() - this.#startedAt.getTime()) / 1000),
      jobCount: jobs.length,
      unitState: host.unitState,
      linger: host.linger,
      lingerByTako: host.lingerByTako,
    };
  }

  #write(context: ConnectionContext, frame: AgentFrame): void {
    if (context.socket.destroyed) return;

    try {
      context.socket.write(encodeFrame(frame) + '\n');
    } catch {
      // A dead socket cleans itself up via its close/error handlers.
    }
  }
}

class UnknownRequestTypeError extends Error {
  constructor(type: string) {
    super(`unknown request type ${JSON.stringify(type)}`);
    this.name = 'UnknownRequestTypeError';
  }
}

function readField(payload: unknown, field: string): string {
  const value = readOptionalField(payload, field);

  if (value === undefined) {
    throw new JobValidationError(`payload field "${field}" is required`);
  }

  return value;
}

function readNumber(payload: unknown, field: string): number {
  const value = readOptionalNumber(payload, field);

  if (value === undefined) {
    throw new JobValidationError(`payload field "${field}" is required`);
  }

  return value;
}

function readOptionalField(payload: unknown, field: string): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;

  const value = (payload as Record<string, unknown>)[field];
  return value === undefined || value === null ? undefined : String(value);
}

function readOptionalNumber(payload: unknown, field: string): number | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;

  const value = (payload as Record<string, unknown>)[field];

  if (value === undefined || value === null) return undefined;

  if (typeof value !== 'number') {
    throw new JobValidationError(`payload field "${field}" must be a number`);
  }

  return value;
}

function toProtocolErrorCode(error: unknown): ProtocolErrorCode {
  if (error instanceof JobValidationError || error instanceof JobNotFoundError) {
    return 'invalid_payload';
  }

  if (error instanceof UnknownRequestTypeError) {
    return 'unknown_type';
  }

  return 'internal';
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Best-effort correlation-id extraction from a frame line that failed to decode. */
function salvageCorrelationId(line: string): string | undefined {
  try {
    const raw: unknown = JSON.parse(line);

    if (typeof raw === 'object' && raw !== null) {
      const id = (raw as Record<string, unknown>)['id'];

      if (typeof id === 'string') return id;
    }
  } catch {
    // Not JSON at all — no correlation id to salvage.
  }

  return undefined;
}
