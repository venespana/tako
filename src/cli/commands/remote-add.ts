// cli/commands/remote-add.ts — CLI endpoint for `tako remote add` (ADR-0020).
//
// The CLI is strictly non-interactive: no TUI views, no forms, no prompts.
// Every field the old wizard collected is a flag; missing required fields are
// read from piped stdin lines (xargs-style, one per missing field, in field
// order); anything still missing prints the plain field list and the command
// exits non-zero. The add flow itself lives behind services/remotes
// (addRemote → hostkey refusal round → confirmAddRemote); this command only
// assembles the request and maps the result to exit codes.
//
// Exit codes: 0 saved · 1 refused/missing input/declined hostkey · 2 unexpected.
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
  readonly password?: string;
  readonly acceptHostkey?: boolean;
};

/** Sinks the command talks to (injected so tests never touch a real stdin). */
export interface RemoteAddIo {
  /** Piped stdin lines (empty when stdin is a TTY). */
  readonly readLines: () => Promise<string[]>;
  readonly log: (line: string) => void;
  readonly error: (line: string) => void;
}

/** One collectible field: canonical order, expected shape, requirement rule. */
interface FieldSpec {
  readonly flag: keyof Omit<RemoteAddFlags, 'acceptHostkey'>;
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
    shape: 'SSH password (required when the credential type is store or interactive)',
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

/** Parse + validate the credential type flag (undefined keeps the store default). */
function parseType(raw: string | undefined): SshCredentialType | undefined {
  if (raw === undefined || raw === '') return undefined;
  if ((CREDENTIAL_TYPES as readonly string[]).includes(raw)) return raw as SshCredentialType;
  return undefined;
}

/**
 * Run the `tako remote add` command: flags + piped stdin → service → exit
 * code. Never renders a view; expected outcomes print and map to codes.
 */
export async function runRemoteAdd(flags: RemoteAddFlags, io: RemoteAddIo): Promise<number> {
  try {
    const type = parseType(flags.type);
    if (flags.type !== undefined && flags.type !== '' && type === undefined) {
      io.error(`tako remote add: invalid --type "${flags.type}" (expected one of: ${CREDENTIAL_TYPES.join(', ')})`);
      return 1;
    }

    const values: Record<string, string | undefined> = {
      name: flags.name,
      user: flags.user,
      host: flags.host,
      port: flags.port,
      type,
      keyPath: flags.keyPath,
      password: flags.password,
    };

    // xargs-style fill: one piped line per missing REQUIRED field, in field
    // order. Optional fields (port, type, key-path) never consume lines —
    // they keep their flag value or default, so a piped y/n hostkey answer
    // always lands in the answer queue, not in an optional slot.
    const lines = await io.readLines();
    for (const spec of FIELD_SPECS) {
      if (!spec.required(values)) continue;
      const current = values[spec.flag];
      if ((current === undefined || current === '') && lines.length > 0) {
        values[spec.flag] = lines.shift();
      }
    }

    const missing = FIELD_SPECS.filter(spec => spec.required(values) && (values[spec.flag] ?? '') === '').map(
      spec => spec.flag
    );
    if (missing.length > 0) {
      io.error(formatFieldList(missing));
      return 1;
    }

    // The missing-field gate above guarantees the required values are present.
    const credentialType = type ?? 'store';
    const draft: RemoteDraft = {
      name: values.name ?? '',
      type: 'ssh',
      username: values.user ?? '',
      host: values.host ?? '',
      port: parsePort(values.port),
      credentialType,
      // store: persisted obfuscated; interactive: validation-only (mirrors the TUI draft)
      ...(credentialType !== 'ssh-key' && values.password !== undefined && { password: values.password }),
      ...(credentialType === 'ssh-key' && { keyPath: values.keyPath ?? DEFAULT_SSH_KEY_PATH }),
    };

    const result = await addRemote({ draft, hostkeyAccepted: flags.acceptHostkey === true });
    return await finishRemoteAdd(draft, result, lines, io);
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

function parsePort(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

/**
 * Default entry: Commander flags in, real stdin/console out. Piped lines are
 * consumed only when stdin is not a TTY (blanks are skipped).
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
