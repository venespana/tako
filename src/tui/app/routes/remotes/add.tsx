// routes/remotes/add.tsx — Route shim for '/remotes/add' (command page: no
// menu of its own — the submenu lives on the '/remotes' index page).
// Injects the composed add-remote use case into the page.
import { RemotesAddPage } from '../../../pages/remotes-add/index.js';
import { getRemotesStack } from '../../remotes-stack.js';

function RemotesAddRoute(): React.ReactElement {
  return <RemotesAddPage addRemoteUc={getRemotesStack().addRemote} />;
}

export default RemotesAddRoute;
