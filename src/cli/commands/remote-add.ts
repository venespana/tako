// cli/commands/remote-add.ts — CLI endpoint for `tako remote add` (ADR-0020).
//
// The CLI is strictly non-interactive: no TUI views, no forms, no prompts.
// Every field the old wizard collected is a flag. Invalid --type/--port values
// are refused loudly (never silently coerced to their default); stdin is read
// only when required fields are still missing, filling them from piped lines
// (xargs-style, one per missing field, in field order); anything still missing
// prints the plain field list and the command exits non-zero. The add flow
// itself lives behind services/remotes (addRemote → hostkey refusal round →
// confirmAddRemote); this command only assembles the request and maps the
// result to exit codes.
//
// Exit codes: 0 saved · 1 invalid flag/refused/missing input/declined hostkey · 2 unexpected.
import type { AddRemoteResult, RemoteDraft, SshCredentialType } from '../../services/remotes.js';
import { addRemote, confirmAddRemote } from '../../services/remotes.js';

/** The credential types the wizard used to offer (store is the default). */
export const CREDENTIAL_TYPES: readonly SshCredentialType[] = ['store', 'ssh-key', 'interactive'];

export const DEFAULT_PORT = 22;
export const DEFAULT_SSH_KEY_PATH = '~/.ssh/id_rsa';

/** Commander flags for `tako remote add` (camelCase, as Commander delivers them). */
export type RemoteAddFlags = {
  readonly name?: string;
  readonly user?: string;
  readonly host?: string;
  readonly port?: string;
  readonly type?: string;
  readonly keyPath?: string;
  readonly acceptHostkey?: boolean;
};

/** Sinks the command talks to (injected so tests never touch a real stdin). */
export interface RemoteAddIo {
  /** Piped stdin lines. Consumed only when required fields are missing — the
   * default sink reads to EOF, so it must not be touched otherwise. */
  readonly readLines: () => Promise<string[]>;
  readonly log: (line: string) => void;
  readonly error: (line: string) => void;
}

/** One collectible field: canonical order, expected shape, requirement rule. */
type FieldName = 'name' | 'user' | 'host' | 'port' | 'type' | 'keyPath' | 'password';
interface FieldSpec {
  readonly flag: FieldName;
  readonly shape: string;
  readonly required: (values: Record<string, string | undefined>) => boolean;
}

// Canonical collection order — the stdin line order and the field-list order.
const FIELD_SPECS: readonly FieldSpec[] = [
  { flag: 'name', shape: 'connection name (e.g. nas-backup)', required: () => true },
  { flag: 'user', shape: 'SSH username (e.g. ops)', required: () => true },
  { flag: 'host', shape: 'hostname or IP address (e.g. 10.0.0.5)', required: () => true },
  { flag: 'port', shape: `SSH port (default ${DEFAULT_PORT})`, required: () => false },
  {
    flag: 'type',
    shape: `credential type: ${CREDENTIAL_TYPES.join(' | ')} (default store)`,
    required: () => false,
  },
  { flag: 'keyPath', shape: 'path to the private SSH key (ssh-key type)', required: () => false },
  {
    flag: 'password',
    shape: 'SSH password (store/interactive): TAKO_SSH_PASSWORD env or a piped stdin line',
    required: values => values.type === undefined || values.type === 'store' || values.type === 'interactive',
  },
];

/** The plain field list (name + expected shape) printed when input is missing. */
export function formatFieldList(missingFlags: readonly string[]): string {
  const lines = ['tako remote add: missing required fields:'];
  for (const flag of missingFlags) {
    const spec = FIELD_SPECS.find(field => field.flag === flag);
    lines.push(`  --${flag}  ${spec?.shape ?? ''}`);
  }
  lines.push('supply them as flags, or pipe one stdin line per missing field (in this order)');
  return lines.join('\n');
}

/** The hostkey confirmation the command cannot guess (ADR-0020 §3). */
function formatHostkeyList(fingerprint: string): string {
  return [
    'tako remote add: hostkey confirmation required:',
    `  --accept-hostkey  accept the unknown host (${fingerprint})`,
  ].join('\n');
}

/** Outcome of parsing one optional flag: absent → default, ok → value,
 * invalid → loud refusal. Each parser's contract is self-evident: the caller
 * never guesses whether `undefined` meant "absent" or "bad input". */
type ParsedFlag<T> =
  | { readonly kind: 'absent' }
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'invalid'; readonly value: string };

/** Parse the credential type flag: absent keeps the store default; anything
 * outside CREDENTIAL_TYPES is an explicit refusal, never a silent default. */
function parseType(raw: string | undefined): ParsedFlag<SshCredentialType> {
  if (raw === undefined || raw === '') return { kind: 'absent' };
  if ((CREDENTIAL_TYPES as readonly string[]).includes(raw)) return { kind: 'ok', value: raw as SshCredentialType };
  return { kind: 'invalid', value: raw };
}

/** Parse the port flag: absent keeps the SSH default; non-integer, non-positive
 * or out-of-range values are an explicit refusal (mirrors --type — never a
 * silent coercion to the default, which would save a wrong-endpoint remote). */
function parsePort(raw: string | undefined): ParsedFlag<number> {
  if (raw === undefined || raw === '') return { kind: 'absent' };
  const parsed = /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) return { kind: 'invalid', value: raw };
  return { kind: 'ok', value: parsed };
}

/**
 * Run the `tako remote add` command: flags + piped stdin → service → exit
 * code. Never renders a view; expected outcomes print and map to codes.
 */
export async function runRemoteAdd(flags: RemoteAddFlags, io: RemoteAddIo): Promise<number> {
  try {
    // Loud refusals first (ADR-0020 §3): a bad flag value prints and exits —
    // it is never silently coerced to its default.
    const type = parseType(flags.type);
    if (type.kind === 'invalid') {
      io.error(`tako remote add: invalid --type "${type.value}" (expected one of: ${CREDENTIAL_TYPES.join(', ')})`);
      return 1;
    }
    const port = parsePort(flags.port);
    if (port.kind === 'invalid') {
      io.error(`tako remote add: invalid --port "${port.value}" (expected an integer between 1 and 65535)`);
      return 1;
    }

    const values: Record<string, string | undefined> = {
      name: flags.name,
      user: flags.user,
      host: flags.host,
      port: flags.port,
      type: type.kind === 'ok' ? type.value : undefined,
      keyPath: flags.keyPath,
      // The secret never travels through argv (ADR-0020 review R1-001):
      // env var or a piped stdin line, nothing else.
      password: process.env.TAKO_SSH_PASSWORD,
    };

    const missingRequired = (): string[] =>
      FIELD_SPECS.filter(spec => spec.required(values) && (values[spec.flag] ?? '') === '').map(spec => spec.flag);

    // Stdin is drained ONLY when required fields are still missing: the real
    // sink reads to EOF, so touching it when every field arrives via flags
    // would block a non-TTY stdin indefinitely.
    let pendingLines: string[] = [];
    if (missingRequired().length > 0) {
      const lines = await io.readLines();
      // xargs-style fill: one piped line per missing REQUIRED field, in field
      // order. Optional fields (port, type, key-path) never consume lines —
      // they keep their flag value or default, so a piped y/n hostkey answer
      // always lands in the answer queue, not in an optional slot.
      for (const spec of FIELD_SPECS) {
        if (!spec.required(values)) continue;
        const current = values[spec.flag];
        if ((current === undefined || current === '') && lines.length > 0) {
          values[spec.flag] = lines.shift();
        }
      }
      const stillMissing = missingRequired();
      if (stillMissing.length > 0) {
        io.error(formatFieldList(stillMissing));
        return 1;
      }
      // Leftover lines stay queued for the hostkey y/n round.
      pendingLines = lines;
    }

    // The gates above guarantee the required values are present and that both
    // optional flags parsed.
    const credentialType: SshCredentialType = type.kind === 'ok' ? type.value : 'store';
    const draft: RemoteDraft = {
      name: values.name ?? '',
      type: 'ssh',
      username: values.user ?? '',
      host: values.host ?? '',
      port: port.kind === 'ok' ? port.value : DEFAULT_PORT,
      credentialType,
      // store: persisted obfuscated; interactive: validation-only (mirrors the TUI draft)
      ...(credentialType !== 'ssh-key' && values.password !== undefined && { password: values.password }),
      ...(credentialType === 'ssh-key' && { keyPath: values.keyPath ?? DEFAULT_SSH_KEY_PATH }),
    };

    const result = await addRemote({ draft, hostkeyAccepted: flags.acceptHostkey === true });
    return await finishRemoteAdd(draft, result, pendingLines, io);
  } catch (err) {
    io.error(String(err));
    return 2;
  }
}

/** Map the add outcome: saved → 0; hostkey → confirmation round; refusals → 1. */
async function finishRemoteAdd(
  draft: RemoteDraft,
  result: AddRemoteResult,
  pendingLines: string[],
  io: RemoteAddIo
): Promise<number> {
  if (result.saved) {
    io.log(`remote "${draft.name}" saved`);
    return 0;
  }
  if (result.reason === 'hostkey') {
    return confirmHostkey(draft, result, pendingLines, io);
  }
  if (result.reason === 'duplicate') {
    io.error(
      result.duplicateKind === 'endpoint'
        ? `remote not saved: ${draft.username}@${draft.host}:${draft.port} already exists`
        : `remote not saved: a remote named "${draft.name}" already exists`
    );
    return 1;
  }
  io.error(`remote not saved: ${result.message ?? result.reason ?? 'unknown failure'}`);
  return 1;
}

/** Hostkey refusal: consume a piped y/n line, or print the field list and exit 1. */
async function confirmHostkey(
  draft: RemoteDraft,
  result: AddRemoteResult,
  pendingLines: string[],
  io: RemoteAddIo
): Promise<number> {
  const fingerprint = result.hostkeyFingerprint ?? 'unknown';
  const answer = pendingLines.shift()?.trim().toLowerCase();
  if (answer === 'y' || answer === 'yes') {
    const confirmed = await confirmAddRemote(draft);
    if (confirmed.saved) {
      io.log(`remote "${draft.name}" saved`);
      return 0;
    }
    io.error(`remote not saved: ${confirmed.message ?? confirmed.reason ?? 'unknown failure'}`);
    return 1;
  }
  if (answer !== undefined) {
    io.error('remote not saved: hostkey declined');
    return 1;
  }
  io.error(formatHostkeyList(fingerprint));
  return 1;
}

/**
 * Default entry: Commander flags in, real stdin/console out. Piped lines are
 * consumed only when required fields are missing AND stdin is not a TTY
 * (blanks are skipped).
 */
export async function runRemoteAddDefault(flags: RemoteAddFlags): Promise<number> {
  return runRemoteAdd(flags, {
    readLines: async () => {
      if (process.stdin.isTTY) return [];
      const text = await new Promise<string>((resolve, reject) => {
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', chunk => {
          data += chunk;
        });
        process.stdin.on('end', () => resolve(data));
        process.stdin.on('error', reject);
      });
      return text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line !== '');
    },
    log: line => console.log(line),
    error: line => console.error(line),
  });
}
