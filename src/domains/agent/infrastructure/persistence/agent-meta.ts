// persistence/agent-meta.ts — thin bun:sqlite KV table for agent_meta (task 4.1)
//
// Tako-owned server-side metadata (design D8: the server is the only
// authoritative witness of pre-existing linger). Seeded keys:
//   linger_enabled_by_tako ('0'|'1') — set by the install/uninstall flow when
//     TAKO enabled or disabled linger; never guessed on uninstall.
//   installed_version / installed_at — recorded by the install flow.
// The table is a plain KV (`key TEXT PRIMARY KEY, value TEXT NOT NULL`), so
// additional install facts (e.g. the prior-install sha256 used by the decoy
// guard) ride along without a schema change.
//
// bun:sqlite is scoped to persistence/** (ADR-0016): consumers MUST reach
// this module via lazy import() so client paths never load it. bunqueue owns
// its own job/scheduler schema in the same dataPath file — no migrations
// list for it (design §SQLite Schema amendment).
import { Database } from 'bun:sqlite';

export const LINGER_ENABLED_BY_TAKO_KEY = 'linger_enabled_by_tako';
export const INSTALLED_VERSION_KEY = 'installed_version';
export const INSTALLED_AT_KEY = 'installed_at';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS agent_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/** Minimal shape SystemdRemoteController consumes for the by-tako flag. */
export interface AgentMetaStore {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
  close(): void;
  getLingerEnabledByTako(): boolean | undefined;
  setLingerEnabledByTako(value: boolean): void;
  getInstalledVersion(): string | undefined;
  setInstalledVersion(version: string): void;
  getInstalledAt(): string | undefined;
  setInstalledAt(iso: string): void;
}

/**
 * Open (creating if needed) the agent_meta table inside the shared agent
 * database. Synchronous by design: bun:sqlite calls are sync and this module
 * only ever runs inside the agent process (ADR-0016).
 */
export function openAgentMeta(dataPath: string): AgentMetaStore {
  const db = new Database(dataPath);
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA busy_timeout = 5000');
  db.exec(SCHEMA_SQL);

  const read = (key: string): string | undefined =>
    (db.query('SELECT value FROM agent_meta WHERE key = ?').get(key) as { value: string } | undefined)?.value;
  const write = (key: string, value: string): void => {
    db.run('INSERT INTO agent_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
      key,
      value,
    ]);
  };

  return {
    get: read,
    set: write,
    delete(key: string): void {
      db.run('DELETE FROM agent_meta WHERE key = ?', [key]);
    },
    close(): void {
      db.close();
    },
    getLingerEnabledByTako(): boolean | undefined {
      const value = read(LINGER_ENABLED_BY_TAKO_KEY);
      if (value === '1') return true;
      if (value === '0') return false;
      return undefined;
    },
    setLingerEnabledByTako(value: boolean): void {
      write(LINGER_ENABLED_BY_TAKO_KEY, value ? '1' : '0');
    },
    getInstalledVersion(): string | undefined {
      return read(INSTALLED_VERSION_KEY);
    },
    setInstalledVersion(version: string): void {
      write(INSTALLED_VERSION_KEY, version);
    },
    getInstalledAt(): string | undefined {
      return read(INSTALLED_AT_KEY);
    },
    setInstalledAt(iso: string): void {
      write(INSTALLED_AT_KEY, iso);
    },
  };
}
