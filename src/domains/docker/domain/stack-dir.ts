// domain/stack-dir.ts — hostile-input guard for stack directories (task 5.3)
//
// A stackDir travels into compose command argvs; these bytes are rejected at
// the domain guard so no downstream assembler ever receives them (threat
// matrix: remote shell construction). Spaces are intentionally allowed
// (commands are argv-passed, never shell-interpolated); control characters
// are rejected via an explicit char-code scan (no-control-regex discipline).
// Own docker-domain copy: ADR-0015 forbids importing agent/domain.

/** Leading dash would be parsed as an argv flag by downstream CLIs. */
const STACK_DIR_LEADING_DASH = /^-/;

/**
 * Shell metacharacters that must NEVER appear in a stackDir: command
 * separators, substitutions, redirections, globs, quotes and escapes.
 */
const STACK_DIR_FORBIDDEN = /[`$;&|<>(){}[\]*?!"'\\]/;

function hasControlChars(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** Validation failure naming the offending value in `reason`. */
export class StackDirValidationError extends Error {
  /** Why the directory was rejected. */
  readonly reason: string;

  constructor(reason: string) {
    super(`invalid stack directory: ${reason}`);
    this.name = 'StackDirValidationError';
    this.reason = reason;
  }
}

/** True when `dir` is a stack path safe to assemble into commands. */
export function isValidStackDir(dir: unknown): dir is string {
  if (typeof dir !== 'string' || dir.length === 0) return false;
  if (STACK_DIR_LEADING_DASH.test(dir)) return false;
  if (hasControlChars(dir)) return false;
  if (hasTraversalSegment(dir)) return false;
  return !STACK_DIR_FORBIDDEN.test(dir);
}

/** `..` as a path segment escapes the intended stacks root (path traversal). */
function hasTraversalSegment(dir: string): boolean {
  return dir.split('/').includes('..');
}

/**
 * Validate an untrusted stack directory before any command is assembled.
 *
 * @throws StackDirValidationError naming the offending value.
 */
export function assertValidStackDir(dir: unknown): string {
  if (typeof dir !== 'string' || dir.length === 0) {
    throw new StackDirValidationError(`expected a non-empty path string, got ${typeof dir}`);
  }
  if (STACK_DIR_LEADING_DASH.test(dir)) {
    throw new StackDirValidationError(`${JSON.stringify(dir)} starts with a dash (would parse as an argv flag)`);
  }
  if (hasControlChars(dir)) {
    throw new StackDirValidationError(`${JSON.stringify(dir)} contains control characters`);
  }
  if (hasTraversalSegment(dir)) {
    throw new StackDirValidationError(`${JSON.stringify(dir)} contains a ".." path segment (path traversal)`);
  }
  if (STACK_DIR_FORBIDDEN.test(dir)) {
    throw new StackDirValidationError(
      `${JSON.stringify(dir)} contains shell metacharacters (paths are argv-passed, never shell-interpolated)`
    );
  }
  return dir;
}
