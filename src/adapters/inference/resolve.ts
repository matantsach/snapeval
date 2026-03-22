import type { InferenceAdapter } from '../../types.js';
import { AdapterNotAvailableError } from '../../errors.js';
import { GitHubModelsInference } from './github-models.js';
import { CopilotSDKInference } from './copilot-sdk.js';

function isGitHubTokenAvailable(): boolean {
  return Boolean(process.env.GITHUB_TOKEN);
}

export function resolveInference(preference: string): InferenceAdapter {
  if (preference === 'auto') {
    return new CopilotSDKInference();
  }

  if (preference === 'copilot') {
    throw new AdapterNotAvailableError(
      'copilot',
      'The copilot CLI inference adapter has been removed. Use --inference copilot-sdk instead.'
    );
  }

  if (preference === 'copilot-sdk') {
    return new CopilotSDKInference();
  }

  if (preference === 'github-models') {
    if (!isGitHubTokenAvailable()) {
      throw new AdapterNotAvailableError(
        'github-models',
        'GITHUB_TOKEN environment variable is not set.'
      );
    }
    return new GitHubModelsInference();
  }

  throw new AdapterNotAvailableError(
    preference,
    `Unknown inference adapter "${preference}". Valid options: auto, copilot-sdk, github-models.`
  );
}
