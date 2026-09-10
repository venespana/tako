// routes/remotes/add.tsx — Route shim for '/remotes/add' (command page: no
// menu of its own — the submenu lives on the '/remotes' index page).
// Injects the composed add-remote use case into the page.
import Conf from 'conf';

import { AddRemote } from '../../../../domains/remotes/application/AddRemote.js';
import { CheckDuplicateRemote } from '../../../../domains/remotes/application/CheckDuplicateRemote.js';
import { ValidateSshConnection } from '../../../../domains/remotes/application/ValidateSshConnection.js';
import { ConfRemoteRepository } from '../../../../domains/remotes/infrastructure/ConfRemoteRepository.js';
import { ConfSecretVault } from '../../../../domains/remotes/infrastructure/ConfSecretVault.js';
import { Ssh2ConnectionTester } from '../../../../domains/remotes/infrastructure/Ssh2ConnectionTester.js';
import { RemotesAddPage } from '../../../pages/remotes-add/index.js';

function buildAddRemoteUc() {
  const confStore = new Conf({ projectName: 'tako' });
  const repository = new ConfRemoteRepository(confStore);
  const validateConnection = new ValidateSshConnection(new Ssh2ConnectionTester());
  return new AddRemote(
    new CheckDuplicateRemote(repository),
    validateConnection,
    new ConfSecretVault(confStore),
    repository
  );
}

function RemotesAddRoute(): React.ReactElement {
  return <RemotesAddPage addRemoteUc={buildAddRemoteUc()} />;
}

export default RemotesAddRoute;
