// remotes-stack.ts — TUI-side composition of the remotes domain stack: the
// single place in the TUI that constructs the conf store and wires the
// infrastructure adapters into use cases (mirroring the CLI composition in
// cli/commands/remote-add.ts). The adapters stay the sole conf consumers —
// this module only builds and injects them. Route shims pull from here, so
// pages receive ports as props and stay app-import-free (FSD). A lazy
// per-process singleton: one conf handle, one stack.
import Conf from 'conf';

import { AddRemote } from '../../domains/remotes/application/AddRemote.js';
import { CheckDuplicateRemote } from '../../domains/remotes/application/CheckDuplicateRemote.js';
import type { RemoteRepository } from '../../domains/remotes/application/RemoteRepository.js';
import { ValidateSshConnection } from '../../domains/remotes/application/ValidateSshConnection.js';
import { ConfRemoteRepository } from '../../domains/remotes/infrastructure/ConfRemoteRepository.js';
import { ConfSecretVault } from '../../domains/remotes/infrastructure/ConfSecretVault.js';
import { Ssh2ConnectionTester } from '../../domains/remotes/infrastructure/Ssh2ConnectionTester.js';

/** The remotes domain stack the TUI consumes: persistence + add flow. */
export interface RemotesStack {
  repository: RemoteRepository;
  addRemote: AddRemote;
}

let stack: RemotesStack | undefined;

/** Get (lazily building) the process-wide remotes stack. */
export function getRemotesStack(): RemotesStack {
  stack ??= (() => {
    const confStore = new Conf({ projectName: 'tako' });
    const repository: RemoteRepository = new ConfRemoteRepository(confStore);
    return {
      repository,
      addRemote: new AddRemote(
        new CheckDuplicateRemote(repository),
        new ValidateSshConnection(new Ssh2ConnectionTester()),
        new ConfSecretVault(confStore),
        repository
      ),
    };
  })();
  return stack;
}
