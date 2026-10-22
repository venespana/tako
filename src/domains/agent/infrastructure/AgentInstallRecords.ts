// infrastructure/AgentInstallRecords.ts — exec-backed install records (task 6.8)
//
// Plain files under the remote ~/.tako directory that the CLIENT-side
// provisioning flow reads/writes over the RemoteCommandRunner port:
//
//   ~/.tako/installed.sha256 — sha256 of the binary placed by the previous
//     successful install; the decoy guard (HybridBinaryProvisioner
//     `priorInstallSha256`) needs it to allow a legitimate UPGRADE while
//     still refusing a foreign file.
//   ~/.tako/linger.by-tako  — present ('1') iff TAKO enabled linger on this
//     host (design D8). The agent's status() callback (server side) reports
//     it verbatim, and uninstall trusts only this recorded flag — it is
//     never guessed.
//
// WHY FILES AND NOT agent_meta: the install/uninstall flow runs on the
// CLIENT and can only reach the server through async exec, while the
// LingerMetaStore seam consumed by SystemdRemoteController is synchronous.
// agent_meta keeps the server-side facts the AGENT itself owns
// (installed_version / installed_at, recorded at agent start by the
// agent-mode composition root).
import { parseSha256Sum } from './HybridBinaryProvisioner.js';
import type { RemoteCommandResult, RemoteCommandRunner } from '../../remotes/application/RemoteCommandRunner.js';

/** Server-side agent directory name (under the remote home). */
export const AGENT_DIR_NAME = '.tako';
/** Prior-install sha256 record used by the decoy guard on upgrades. */
export const INSTALLED_SHA256_FILENAME = 'installed.sha256';
/** Linger-by-tako marker (present = Tako enabled linger). */
export const LINGER_BY_TAKO_FILENAME = 'linger.by-tako';

export class RemoteInstallRecords {
  readonly #runner: RemoteCommandRunner;
  #home?: string;

  constructor(runner: RemoteCommandRunner) {
    this.#runner = runner;
  }

  /** Resolve the remote home once — sftp-server does not expand tilde (6.8). */
  async home(): Promise<string> {
    this.#home ??= await this.#resolveHome();
    return this.#home;
  }

  /** sha256 recorded by the previous install, or undefined on first install. */
  async readInstalledSha256(): Promise<string | undefined> {
    const home = await this.home();
    const path = `${home}/${AGENT_DIR_NAME}/${INSTALLED_SHA256_FILENAME}`;
    const result = await this.#exec(`cat '${path}' 2>/dev/null`);

    if (result.exitCode !== 0) return undefined;

    const sha = parseSha256Sum(result.stdout);

    if (sha === undefined) {
      throw new Error(`corrupted prior-install record at ${path}: expected a sha256 line`);
    }

    return sha;
  }

  /** Record the sha256 of the binary this install placed (exit-checked). */
  async writeInstalledSha256(sha256: string): Promise<void> {
    const home = await this.home();
    const path = `${home}/${AGENT_DIR_NAME}/${INSTALLED_SHA256_FILENAME}`;
    await this.#require(`printf '%s' '${sha256}' > '${path}'`, `could not record the installed sha256 at ${path}`);
  }

  /** Record that TAKO enabled linger on this host (design D8). */
  async writeLingerByTako(): Promise<void> {
    const home = await this.home();
    const path = `${home}/${AGENT_DIR_NAME}/${LINGER_BY_TAKO_FILENAME}`;
    await this.#require(`printf '1' > '${path}'`, `could not record the linger-by-tako marker at ${path}`);
  }

  async #resolveHome(): Promise<string> {
    const result = await this.#exec('printf %s "$HOME"');
    const home = result.stdout.trim();

    if (result.exitCode !== 0 || home === '') {
      throw new Error('could not resolve the remote home directory');
    }

    return home;
  }

  async #exec(command: string): Promise<RemoteCommandResult> {
    return this.#runner.run(command);
  }

  async #require(command: string, failure: string): Promise<void> {
    const result = await this.#exec(command);

    if (result.exitCode !== 0) {
      const detail = result.stderr.trim() || `exit code ${result.exitCode}`;
      throw new Error(`${failure}: ${detail}`);
    }
  }
}
