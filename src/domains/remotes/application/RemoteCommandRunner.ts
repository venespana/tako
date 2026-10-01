// RemoteCommandRunner.ts — PORT interface (application layer owns this)

/** Result of a command executed on a remote host. */
export interface RemoteCommandResult {
  /** Decoded standard output (utf8). */
  readonly stdout: string;
  /** Decoded standard error (utf8). */
  readonly stderr: string;
  /** Exit status; null when the command was terminated by a signal. */
  readonly exitCode: number | null;
}

/**
 * Port: run a command on a remote host and capture stdout, stderr and exit
 * status. Non-zero exit codes are results, not errors — only transport
 * failures (connection or channel errors) reject the promise.
 */
export interface RemoteCommandRunner {
  run(command: string): Promise<RemoteCommandResult>;
}
