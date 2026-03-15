import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AdapterNotAvailableError } from '../../src/errors.js';

const mockExecFileSync = vi.fn();
vi.mock('node:child_process', () => ({ execFileSync: mockExecFileSync }));

const { resolveInference } = await import('../../src/adapters/inference/resolve.js');

function withEnv(key: string, value: string | undefined, fn: () => void): void {
  const original = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
  try {
    fn();
  } finally {
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
}

describe('resolveInference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('preference: "auto"', () => {
    it('returns CopilotInference when copilot available and no GITHUB_TOKEN', () => {
      mockExecFileSync.mockReturnValue('copilot 1.0.0');
      withEnv('GITHUB_TOKEN', undefined, () => {
        const adapter = resolveInference('auto');
        expect(adapter.name).toBe('copilot');
      });
    });

    it('returns GitHubModelsInference when copilot not available but GITHUB_TOKEN set', () => {
      mockExecFileSync.mockImplementation(() => { throw new Error('not found'); });
      withEnv('GITHUB_TOKEN', 'test-token', () => {
        const adapter = resolveInference('auto');
        expect(adapter.name).toBe('github-models');
      });
    });

    it('returns CopilotInference (with GitHubModels fallback) when both copilot and GITHUB_TOKEN available', () => {
      mockExecFileSync.mockReturnValue('copilot 1.0.0');
      withEnv('GITHUB_TOKEN', 'test-token', () => {
        const adapter = resolveInference('auto');
        expect(adapter.name).toBe('copilot');
      });
    });

    it('throws AdapterNotAvailableError when neither copilot nor GITHUB_TOKEN available', () => {
      mockExecFileSync.mockImplementation(() => { throw new Error('not found'); });
      withEnv('GITHUB_TOKEN', undefined, () => {
        expect(() => resolveInference('auto')).toThrow(AdapterNotAvailableError);
      });
    });
  });

  describe('preference: "copilot"', () => {
    it('returns CopilotInference when copilot is available', () => {
      mockExecFileSync.mockReturnValue('copilot 1.0.0');
      withEnv('GITHUB_TOKEN', undefined, () => {
        const adapter = resolveInference('copilot');
        expect(adapter.name).toBe('copilot');
      });
    });

    it('throws AdapterNotAvailableError when copilot is not available', () => {
      mockExecFileSync.mockImplementation(() => { throw new Error('not found'); });
      withEnv('GITHUB_TOKEN', undefined, () => {
        expect(() => resolveInference('copilot')).toThrow(AdapterNotAvailableError);
      });
    });
  });

  describe('preference: "github-models"', () => {
    it('returns GitHubModelsInference when GITHUB_TOKEN is set', () => {
      withEnv('GITHUB_TOKEN', 'token-abc', () => {
        const adapter = resolveInference('github-models');
        expect(adapter.name).toBe('github-models');
      });
    });

    it('throws AdapterNotAvailableError when GITHUB_TOKEN is not set', () => {
      withEnv('GITHUB_TOKEN', undefined, () => {
        expect(() => resolveInference('github-models')).toThrow(AdapterNotAvailableError);
      });
    });
  });

  describe('unknown preference', () => {
    it('throws AdapterNotAvailableError for unknown adapter name', () => {
      expect(() => resolveInference('unknown-adapter')).toThrow(AdapterNotAvailableError);
    });

    it('error message mentions the unknown adapter name', () => {
      try {
        resolveInference('my-custom-adapter');
      } catch (e) {
        expect((e as Error).message).toContain('my-custom-adapter');
      }
    });
  });
});
