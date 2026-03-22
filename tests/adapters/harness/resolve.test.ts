import { describe, it, expect } from 'vitest';
import { resolveHarness } from '../../../src/adapters/harness/resolve.js';
import { SnapevalError } from '../../../src/errors.js';

describe('resolveHarness', () => {
  it('returns CopilotSDKHarness for copilot-sdk', () => {
    const harness = resolveHarness('copilot-sdk');
    expect(harness.name).toBe('copilot-sdk');
  });

  it('returns CopilotCLIHarness for copilot-cli', () => {
    const harness = resolveHarness('copilot-cli');
    expect(harness.name).toBe('copilot-cli');
  });

  it('throws SnapevalError for unknown harness name', () => {
    expect(() => resolveHarness('unknown')).toThrow(SnapevalError);
    expect(() => resolveHarness('unknown')).toThrow(/Unknown harness/);
  });
});
