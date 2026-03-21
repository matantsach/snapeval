import type { Harness } from '../../types.js';
import { CopilotCLIHarness } from './copilot-cli.js';
import { CopilotSDKHarness } from './copilot-sdk.js';
import { AdapterNotAvailableError, SnapevalError } from '../../errors.js';
import { isSDKInstalled } from '../copilot-sdk-client.js';

export function resolveHarness(name: string): Harness {
  if (name === 'copilot-sdk') {
    if (!isSDKInstalled()) {
      throw new AdapterNotAvailableError(
        'copilot-sdk',
        '@github/copilot-sdk is not installed. Install with: npm install @github/copilot-sdk'
      );
    }
    return new CopilotSDKHarness();
  }
  if (name === 'copilot-cli') {
    return new CopilotCLIHarness();
  }
  throw new SnapevalError(`Unknown harness "${name}". Built-in options: copilot-sdk, copilot-cli.`);
}
