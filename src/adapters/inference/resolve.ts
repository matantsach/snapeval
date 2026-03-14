import { execFileSync } from 'node:child_process';
import type { InferenceAdapter } from '../../types.js';
import { AdapterNotAvailableError } from '../../errors.js';
import { GitHubModelsInference } from './github-models.js';
import { CopilotInference } from './copilot.js';

function isCopilotAvailable(): boolean {
  try {
    execFileSync('gh', ['copilot', '--version'], { encoding: 'utf-8', stdio: 'pipe' });
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

    if (copilotAvailable && tokenAvailable) {
      // Copilot for chat, GitHubModels as embedding fallback
      const githubModels = new GitHubModelsInference();
      return new CopilotInference(githubModels);
    }

    if (copilotAvailable) {
      return new CopilotInference();
    }

    if (tokenAvailable) {
      return new GitHubModelsInference();
    }

    throw new AdapterNotAvailableError(
      'inference',
      'No inference adapter available. Install GitHub Copilot CLI (`gh extension install github/gh-copilot`) or set GITHUB_TOKEN.'
    );
  }

  if (preference === 'copilot') {
    if (!isCopilotAvailable()) {
      throw new AdapterNotAvailableError(
        'copilot',
        'GitHub Copilot CLI is not available. Install with: gh extension install github/gh-copilot'
      );
    }
    const fallback = isGitHubTokenAvailable() ? new GitHubModelsInference() : undefined;
    return new CopilotInference(fallback);
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
