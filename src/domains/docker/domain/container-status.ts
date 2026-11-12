// container-status.ts — docker container snapshot + strict parser
// (iteration 2 of tui-remote-home-screen; health added in T3-health-status)
//
// Pure module: no I/O, no node imports. Parses `docker ps -a --format
// '{{json .}}'` stdout — JSON-lines, one object per container. Malformed
// output is a STRICT refusal object (loud-refusal convention, mirroring
// stack-status): corrupt data is never partially rendered. The command's
// exit code is the caller's concern (GetContainers).
//
// ASYMMETRIC STRICTNESS (T3-health-status): the CORE identity fields
// (Names/State — and the strict lines around them) keep full strict
// refusal, but HEALTH is auxiliary metadata whose shape varies across
// docker versions (the ps formatter emitted it as `Health` historically
// and as `HealthStatus` since the API v1.52 rename — always a plain
// string there, while the engine inspect API uses {Status: ...} objects).
// A line with a missing or foreign-shaped health field therefore parses
// to `health: null` instead of refusing: never rendering a health badge
// is benign, refusing a whole inventory over auxiliary metadata is not.

/** Closed docker healthcheck outcome (`.Health`/`.HealthStatus` of docker ps). */
export type ContainerHealth = 'healthy' | 'unhealthy' | 'starting';

/** One docker container as `docker ps -a` reports it. */
export interface ContainerSnapshot {
  /** Full docker container ID. */
  readonly id: string;
  /** Container name; docker may join several as comma-separated — the first wins. */
  readonly name: string;
  /** Raw docker state, e.g. `running`, `exited`, `paused`. */
  readonly state: string;
  /** `com.docker.compose.project` label; null when the container is standalone. */
  readonly composeProject: string | null;
  /** Healthcheck outcome; null when no healthcheck is defined (or the field's
   * shape is foreign to this docker version — auxiliary metadata never refuses). */
  readonly health: ContainerHealth | null;
}

/** Parse outcome: snapshots, or a strict refusal with a human-readable reason. */
export type ContainerStatusParse =
  | { readonly kind: 'ok'; readonly containers: readonly ContainerSnapshot[] }
  | { readonly kind: 'refusal'; readonly reason: string };

const COMPOSE_PROJECT_LABEL = 'com.docker.compose.project';

/** Closed union of docker healthcheck outcomes, as a lookup (typed object
 * over switch-case). */
const HEALTH_VALUES: ReadonlySet<string> = new Set<ContainerHealth>(['healthy', 'unhealthy', 'starting']);

const toHealth = (value: unknown): ContainerHealth | null =>
  typeof value === 'string' && HEALTH_VALUES.has(value) ? (value as ContainerHealth) : null;

/**
 * Health from one parsed ps JSON object: the docker CLI formatter emits
 * health as a plain string under `Health` (older CLIs) or `HealthStatus`
 * (API v1.52 rename). The object-with-`Status` shape is accepted defensively
 * for engine-style payloads. Anything else — empty, unknown values, foreign
 * shapes — is null: auxiliary metadata never refuses a line.
 */
const parseHealth = (container: Record<string, unknown>): ContainerHealth | null => {
  const healthField = 'Health' in container ? container['Health'] : container['HealthStatus'];

  if (typeof healthField === 'string') return toHealth(healthField);

  if (isRecord(healthField)) return toHealth(healthField['Status']);

  return null;
};

const refuse = (reason: string): ContainerStatusParse => ({ kind: 'refusal', reason });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Parse a `k=v,k=v` label string; a pair's value may itself contain `=`. */
const parseLabels = (labels: string): ReadonlyMap<string, string> => {
  const map = new Map<string, string>();

  labels.split(',').forEach(pair => {
    const separator = pair.indexOf('=');

    if (separator === -1) return;

    map.set(pair.slice(0, separator), pair.slice(separator + 1));
  });

  return map;
};

/** Validate one raw docker ps object. Returns the snapshot or the refusal reason. */
const toSnapshot = (value: unknown, label: string): ContainerSnapshot | string => {
  if (!isRecord(value)) return `${label} is not a JSON object`;

  const { ID, Labels, Names, State } = value;

  if (typeof Names !== 'string' || Names === '') return `${label} has no container name`;

  if (typeof State !== 'string' || State === '') return `${label} has no state`;

  const composeProject = parseLabels(typeof Labels === 'string' ? Labels : '').get(COMPOSE_PROJECT_LABEL);

  return {
    id: typeof ID === 'string' ? ID : '',
    name: Names.split(',')[0] ?? '',
    state: State,
    composeProject: composeProject === undefined || composeProject === '' ? null : composeProject,
    health: parseHealth(value),
  };
};

/**
 * Parse `docker ps -a --format '{{json .}}'` stdout: JSON-lines, one object
 * per container. Strict refusal on any malformed output — the caller renders
 * either the whole list or an error, never a partial one.
 */
export function parseDockerPsJson(stdout: string): ContainerStatusParse {
  const trimmed = stdout.trim();

  if (trimmed === '') return { kind: 'ok', containers: [] };

  const lines = trimmed.split('\n').filter(line => line.trim() !== '');
  const parsedLines = lines.map((line, index) => {
    try {
      return toSnapshot(JSON.parse(line) as unknown, `docker ps line ${index + 1}`);
    } catch {
      return `docker ps line ${index + 1} is not valid JSON`;
    }
  });

  // First refusal wins: one corrupt line refuses the WHOLE output (strict).
  const refusalReason = parsedLines.find((entry): entry is string => typeof entry === 'string');

  if (refusalReason !== undefined) return refuse(refusalReason);

  return {
    kind: 'ok',
    containers: parsedLines.filter((entry): entry is ContainerSnapshot => typeof entry !== 'string'),
  };
}
