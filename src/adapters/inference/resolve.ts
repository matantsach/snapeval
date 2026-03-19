import { execFileSync } from 'node:child_process';
import type { InferenceAdapter } from '../../types.js';
import { AdapterNotAvailableError } from '../../errors.js';
import { GitHubModelsInference } from './github-models.js';
import { CopilotInference } from './copilot.js';

function isCopilotAvailable(): boolean {
  try {
    execFileSync('copilot', ['--version'], { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function isGitHubTokenAvailable(): boolean {
  return Boolean(process.env.GITHUB_TOKEN);
}

export function resolveInference(preference: string): InferenceAdapter {
  if (preference === 'auto') {
    const copilotAvailable = isCopilotAvailable();
    const tokenAvailable = isGitHubTokenAvailable();

    if (copilotAvailable) {
      return new CopilotInference();
    }

    if (tokenAvailable) {
      return new GitHubModelsInference();
    }

    throw new AdapterNotAvailableError(
      'inference',
      'No inference adapter available. Install GitHub Copilot CLI (`npm install -g @github/copilot`) or set GITHUB_TOKEN.'
    );
  }

  if (preference === 'copilot') {
    if (!isCopilotAvailable()) {
      throw new AdapterNotAvailableError(
        'copilot',
        'GitHub Copilot CLI is not available. Install with: npm install -g @github/copilot'
      );
    }
    return new CopilotInference();
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
    `Unknown inference adapter "${preference}". Valid options: auto, copilot, github-models.`
  );
}
