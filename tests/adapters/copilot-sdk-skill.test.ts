import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SkillOutput } from '../../src/types.js';

// Mock the shared client module
const mockCreateSession = vi.fn();
const mockStart = vi.fn().mockResolvedValue(undefined);
const mockStop = vi.fn().mockResolvedValue(undefined);
const mockDisconnect = vi.fn().mockResolvedValue(undefined);
const mockSendAndWait = vi.fn();
const mockSessionOn = vi.fn().mockReturnValue(vi.fn()); // returns unsubscribe

vi.mock('../../src/adapters/copilot-sdk-client.js', () => ({
  getClient: vi.fn().mockResolvedValue({
    createSession: mockCreateSession,
    start: mockStart,
    stop: mockStop,
  }),
  stopClient: vi.fn(),
  isSDKInstalled: vi.fn().mockReturnValue(true),
}));

// Mock fs for SKILL.md reading
const mockReadFile = vi.fn();
vi.mock('node:fs/promises', () => ({
  readFile: (...args: any[]) => mockReadFile(...args),
}));

const { CopilotSDKAdapter } = await import('../../src/adapters/skill/copilot-sdk.js');

describe('CopilotSDKAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSession.mockResolvedValue({
      on: mockSessionOn,
      sendAndWait: mockSendAndWait,
      disconnect: mockDisconnect,
    });
    mockSendAndWait.mockResolvedValue({
      data: { content: 'SDK response output' },
    });
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('name', () => {
    it('is "copilot-sdk"', () => {
      const adapter = new CopilotSDKAdapter();
      expect(adapter.name).toBe('copilot-sdk');
    });
  });

  describe('invoke()', () => {
    it('creates a session and sends prompt', async () => {
      const adapter = new CopilotSDKAdapter();
      await adapter.invoke('/path/to/skill', 'test prompt');

      expect(mockCreateSession).toHaveBeenCalledOnce();
      expect(mockSendAndWait).toHaveBeenCalledWith({ prompt: 'test prompt' });
    });

    it('returns trimmed response as raw output', async () => {
      mockSendAndWait.mockResolvedValue({
        data: { content: '  trimmed output  \n' },
      });

      const adapter = new CopilotSDKAdapter();
      const result = await adapter.invoke('/skill', 'prompt');
      expect(result.raw).toBe('trimmed output');
    });

    it('records durationMs in metadata', async () => {
      const adapter = new CopilotSDKAdapter();
      const result = await adapter.invoke('/skill', 'prompt');
      expect(result.metadata.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.metadata.durationMs).toBe('number');
    });

    it('sets adapter to "copilot-sdk" in metadata', async () => {
      const adapter = new CopilotSDKAdapter();
      const result = await adapter.invoke('/skill', 'prompt');
      expect(result.metadata.adapter).toBe('copilot-sdk');
    });

    it('includes SKILL.md as systemMessage when present', async () => {
      mockReadFile.mockResolvedValue('# My Skill\nDo things.');

      const adapter = new CopilotSDKAdapter();
      await adapter.invoke('/skill', 'prompt');

      const sessionOpts = mockCreateSession.mock.calls[0][0];
      expect(sessionOpts.systemMessage).toEqual({ content: '# My Skill\nDo things.' });
    });

    it('creates session without systemMessage when SKILL.md is missing', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      const adapter = new CopilotSDKAdapter();
      await adapter.invoke('/skill', 'prompt');

      const sessionOpts = mockCreateSession.mock.calls[0][0];
      expect(sessionOpts.systemMessage).toBeUndefined();
    });

    it('disconnects session after invocation', async () => {
      const adapter = new CopilotSDKAdapter();
      await adapter.invoke('/skill', 'prompt');
      expect(mockDisconnect).toHaveBeenCalledOnce();
    });

    it('disconnects session even if sendAndWait throws', async () => {
      mockSendAndWait.mockRejectedValue(new Error('send failed'));

      const adapter = new CopilotSDKAdapter();
      await expect(adapter.invoke('/skill', 'prompt')).rejects.toThrow('send failed');
      expect(mockDisconnect).toHaveBeenCalledOnce();
    });

    it('handles null response data gracefully', async () => {
      mockSendAndWait.mockResolvedValue(null);

      const adapter = new CopilotSDKAdapter();
      const result = await adapter.invoke('/skill', 'prompt');
      expect(result.raw).toBe('');
    });

    it('subscribes to events and unsubscribes after', async () => {
      const mockUnsubscribe = vi.fn();
      mockSessionOn.mockReturnValue(mockUnsubscribe);

      const adapter = new CopilotSDKAdapter();
      await adapter.invoke('/skill', 'prompt');

      expect(mockSessionOn).toHaveBeenCalledOnce();
      expect(mockUnsubscribe).toHaveBeenCalledOnce();
    });

    it('sets onPermissionRequest to auto-approve', async () => {
      const adapter = new CopilotSDKAdapter();
      await adapter.invoke('/skill', 'prompt');

      const sessionOpts = mockCreateSession.mock.calls[0][0];
      const result = await sessionOpts.onPermissionRequest();
      expect(result).toEqual({ kind: 'approved' });
    });

    it('uses gpt-4.1 as the model', async () => {
      const adapter = new CopilotSDKAdapter();
      await adapter.invoke('/skill', 'prompt');

      const sessionOpts = mockCreateSession.mock.calls[0][0];
      expect(sessionOpts.model).toBe('gpt-4.1');
    });
  });

  describe('isAvailable()', () => {
    it('returns true when getClient succeeds', async () => {
      const adapter = new CopilotSDKAdapter();
      const available = await adapter.isAvailable();
      expect(available).toBe(true);
    });

    it('returns false when getClient throws', async () => {
      const { getClient } = await import('../../src/adapters/copilot-sdk-client.js');
      vi.mocked(getClient).mockRejectedValueOnce(new Error('not installed'));

      const adapter = new CopilotSDKAdapter();
      const available = await adapter.isAvailable();
      expect(available).toBe(false);
    });
  });
});
