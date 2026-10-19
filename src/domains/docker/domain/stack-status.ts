// stack-status.ts — compose stack status entry + strict parser (S1 of mvp-status-command)
//
// Pure module: no I/O, no node imports. Parses `docker compose ls --format
// json` stdout — a JSON array (current compose v2) or JSON-lines (older
// builds). Malformed output is a STRICT refusal object (user decision
// 2026-10-17, loud-refusal convention): corrupt data is never partially
// rendered. The command's exit code is the caller's concern (GetStackStatus).

/** One compose stack as `docker compose ls` reports it. */
export interface StackStatusEntry {
  /** Compose project name. */
  readonly name: string;
  /** Human status, e.g. `running(2)` or `exited(1)`. */
  readonly status: string;
  /** Config files defining the stack, as compose joins them. */
  readonly configFiles: string;
}

/** Parse outcome: entries, or a strict refusal with a human-readable reason. */
export type StackStatusParse =
  | { readonly kind: 'ok'; readonly entries: readonly StackStatusEntry[] }
  | { readonly kind: 'refusal'; readonly reason: string };

const refuse = (reason: string): StackStatusParse => ({ kind: 'refusal', reason });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Validate one raw compose ls object. Returns the entry or the refusal reason. */
const toEntry = (value: unknown, label: string): StackStatusEntry | string => {
  if (!isRecord(value)) return `${label} is not a JSON object`;

  const { Name, Status, ConfigFiles } = value;

  if (typeof Name !== 'string' || Name === '') return `${label} has no project name`;

  return {
    name: Name,
    status: typeof Status === 'string' ? Status : '',
    configFiles: typeof ConfigFiles === 'string' ? ConfigFiles : '',
  };
};

/** First refusal wins: one corrupt entry refuses the WHOLE output (strict). */
const collectEntries = (parsed: readonly (StackStatusEntry | string)[]): StackStatusParse => {
  const refusalReason = parsed.find((entry): entry is string => typeof entry === 'string');

  if (refusalReason !== undefined) return refuse(refusalReason);

  return { kind: 'ok', entries: parsed.filter((entry): entry is StackStatusEntry => typeof entry !== 'string') };
};

const toArrayEntries = (parsed: unknown): StackStatusParse => {
  if (!Array.isArray(parsed)) return refuse('compose ls output is not a JSON array');

  return collectEntries(parsed.map((item, index) => toEntry(item, `compose ls entry ${index}`)));
};

const toLineEntries = (trimmed: string): StackStatusParse => {
  const lines = trimmed.split('\n').filter(line => line.trim() !== '');

  if (lines.length === 0) return refuse('compose ls output has no parseable lines');

  const parsedLines = lines.map((line, index) => {
    try {
      return toEntry(JSON.parse(line) as unknown, `compose ls line ${index + 1}`);
    } catch {
      return `compose ls line ${index + 1} is not valid JSON`;
    }
  });

  return collectEntries(parsedLines);
};

/**
 * Parse `docker compose ls --format json` stdout: a JSON array (current
 * compose v2) or JSON-lines (older builds). Strict refusal on any malformed
 * output — the caller renders either the whole list or an error, never a
 * partial one.
 */
export function parseComposeLsJson(stdout: string): StackStatusParse {
  const trimmed = stdout.trim();

  if (trimmed === '') return { kind: 'ok', entries: [] };

  // The array shape starts with '['; anything else is read as JSON-lines.
  if (!trimmed.startsWith('[')) return toLineEntries(trimmed);

  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return refuse('compose ls output is not valid JSON');
  }

  return toArrayEntries(parsed);
}
