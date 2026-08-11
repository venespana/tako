// LocalHostToolChecker.ts — INFRASTRUCTURE adapter (sole Bun.spawn consumer)
import type { HostToolChecker } from '../application/HostToolChecker.js';
import type { HostTool, ToolCheckResult } from '../domain/types.js';

const TOOL_FLAGS: Record<HostTool, string> = {
  ssh: '-V',
  ssl: '-V', // ssl is derived from ssh -V output
  git: '--version',
  docker: '-v',
  'docker-compose': 'version',
};

// ssh -V writes to tty, not stderr — wrap with script(1) to capture
// docker-compose is a multi-word command passed as ['docker', 'compose']
// ssl is a pseudo-tool — no spawn, extracted from ssh -V output
const TOOL_CMD: Record<HostTool, string[]> = {
  ssh: ['/usr/bin/script', '-qc', 'ssh -V', '/dev/null'],
  ssl: [],
  git: ['git'],
  docker: ['docker'],
  'docker-compose': ['docker', 'compose'],
};

function normalizeVersion(tool: HostTool, version: string): string {
  switch (tool) {
    case 'ssh': {
      // "OpenSSH_10.4p1, OpenSSL 3.6.3 9 Jun 2026" → "10.4p1"
      const match = version.match(/OpenSSH_([^\s,]+)/);
      return match ? (match[1] ?? version) : version;
    }
    case 'ssl': {
      // "OpenSSH_10.4p1, OpenSSL 3.6.3 9 Jun 2026" → "3.6.3"
      const match = version.match(/OpenSSL[_\s]([^\s,]+)/);
      return match ? (match[1] ?? version) : version;
    }
    case 'git': {
      // "git version 2.55.0" → "2.55.0"
      return version.replace(/^git version /, '');
    }
    case 'docker': {
      // "Docker version 29.7.2, build a7dcaa6fdb" → "29.7.2 (a7dcaa6fdb)"
      const verMatch = version.match(/Docker version ([^,]+)/);
      const buildMatch = version.match(/build ([a-f0-9]+)/);
      const ver = verMatch ? verMatch[1] : version;
      const build = buildMatch ? ` (${buildMatch[1]})` : '';
      return `${ver}${build}`;
    }
    case 'docker-compose': {
      // "Docker Compose version v2.24.0" → "v2.24.0"
      return version.replace(/^Docker Compose version /, '');
    }
    default:
      return version;
  }
}

export class LocalHostToolChecker implements HostToolChecker {
  constructor(private readonly spawn: typeof Bun.spawn = Bun.spawn.bind(Bun)) {}

  // Returns raw output string from spawn, or null on error/enoent
  // ssl uses this to extract SSL version from ssh raw output
  private async spawnAndGetRaw(tool: HostTool): Promise<{ output: string | null; found: boolean }> {
    const flag = TOOL_FLAGS[tool];
    const cmd = TOOL_CMD[tool];

    try {
      let proc;
      if (cmd.length === 1) {
        proc = this.spawn([cmd[0]!, flag]);
      } else if (tool === 'ssh') {
        proc = this.spawn([cmd[0]!, cmd[1]!, cmd[2]!, cmd[3]!]);
      } else if (cmd.length === 2) {
        proc = this.spawn([cmd[0]!, cmd[1]!, flag]);
      } else {
        proc = this.spawn([cmd[0]!, flag]);
      }

      const [exited, stdout, stderr] = await Promise.all([
        proc.exited,
        proc.stdout.text(),
        (proc.stderr as { text(): Promise<string> } | undefined)?.text() ?? Promise.resolve(''),
      ]);

      // exit !== 0: binary found but flag failed → found=true, output=null
      const found = true;
      const output = exited === 0 ? stdout.trim() || stderr.trim() || null : null;
      return { output, found };
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return { output: null, found: false };
      }
      return { output: null, found: false };
    }
  }

  async check(tool: HostTool): Promise<ToolCheckResult> {
    // ssl is a pseudo-tool — extract SSL version from ssh -V raw output
    if (tool === 'ssl') {
      const { output, found } = await this.spawnAndGetRaw('ssh');
      if (!found || !output) {
        return { tool: 'ssl', status: 'not-found', version: null };
      }
      const sslMatch = output.match(/OpenSSL[_\s]([^\s,]+)/);
      return { tool: 'ssl', status: 'found', version: sslMatch ? (sslMatch[1] ?? null) : null };
    }

    const { output, found } = await this.spawnAndGetRaw(tool);
    if (!found) {
      return { tool, status: 'not-found', version: null };
    }
    if (!output) {
      return { tool, status: 'found', version: null };
    }

    return { tool, status: 'found', version: normalizeVersion(tool, output) };
  }
}
