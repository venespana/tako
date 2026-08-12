// VersionBar.tsx — Footer showing the build-time VERSION constant.
import { Text } from 'ink';

import { VERSION } from '../../shared/lib/version.js';

export function VersionBar(): React.ReactElement {
  return <Text dimColor={true}>v{VERSION}</Text>;
}
