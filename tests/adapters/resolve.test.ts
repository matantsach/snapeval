import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AdapterNotAvailableError } from '../../src/errors.js';

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
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  describe('preference: "auto"', () => {
    it('returns CopilotSDKInference unconditionally', () => {
      const adapter = resolveInference('auto');
      expect(adapter.name).toBe('copilot-sdk');
    });
  });

  describe('preference: "copilot"', () => {
    it('throws AdapterNotAvailableError with migration message', () => {
      expect(() => resolveInference('copilot')).toThrow(AdapterNotAvailableError);
      try {
        resolveInference('copilot');
      } catch (e) {
        expect((e as Error).message).toContain('removed');
        expect((e as Error).message).toContain('copilot-sdk');
      }
    });
  });

  describe('preference: "copilot-sdk"', () => {
    it('returns CopilotSDKInference', () => {
      const adapter = resolveInference('copilot-sdk');
      expect(adapter.name).toBe('copilot-sdk');
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
