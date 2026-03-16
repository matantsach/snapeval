import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AdapterNotAvailableError } from '../../src/errors.js';
import type { InferenceAdapter } from '../../src/types.js';

// Mock the shared client module
const mockCreateSession = vi.fn();
const mockDisconnect = vi.fn().mockResolvedValue(undefined);
const mockSendAndWait = vi.fn();

vi.mock('../../src/adapters/copilot-sdk-client.js', () => ({
  getClient: vi.fn().mockResolvedValue({
    createSession: mockCreateSession,
  }),
  stopClient: vi.fn(),
  isSDKInstalled: vi.fn().mockReturnValue(true),
}));

const { CopilotSDKInference } = await import('../../src/adapters/inference/copilot-sdk.js');

describe('CopilotSDKInference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSession.mockResolvedValue({
      sendAndWait: mockSendAndWait,
      disconnect: mockDisconnect,
    });
    mockSendAndWait.mockResolvedValue({
      data: { content: 'SDK chat response' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('name', () => {
    it('is "copilot-sdk"', () => {
      const adapter = new CopilotSDKInference();
      expect(adapter.name).toBe('copilot-sdk');
    });
  });

  describe('chat()', () => {
    it('creates session and sends user prompt', async () => {
      const adapter = new CopilotSDKInference();
      const result = await adapter.chat([{ role: 'user', content: 'hello' }]);

      expect(mockCreateSession).toHaveBeenCalledOnce();
      expect(mockSendAndWait).toHaveBeenCalledWith({ prompt: 'hello' });
      expect(result).toBe('SDK chat response');
    });

    it('trims whitespace from response', async () => {
      mockSendAndWait.mockResolvedValue({
        data: { content: '  trimmed  \n' },
      });

      const adapter = new CopilotSDKInference();
      const result = await adapter.chat([{ role: 'user', content: 'test' }]);
      expect(result).toBe('trimmed');
    });

    it('extracts system messages into systemMessage config', async () => {
      const adapter = new CopilotSDKInference();
      await adapter.chat([
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'What is 2+2?' },
      ]);

      const sessionOpts = mockCreateSession.mock.calls[0][0];
      expect(sessionOpts.systemMessage).toEqual({ content: 'You are helpful.' });
      expect(mockSendAndWait).toHaveBeenCalledWith({ prompt: 'What is 2+2?' });
    });

    it('omits systemMessage when no system messages present', async () => {
      const adapter = new CopilotSDKInference();
      await adapter.chat([{ role: 'user', content: 'hello' }]);

      const sessionOpts = mockCreateSession.mock.calls[0][0];
      expect(sessionOpts.systemMessage).toBeUndefined();
    });

    it('concatenates multiple user messages', async () => {
      const adapter = new CopilotSDKInference();
      await adapter.chat([
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'ack' },
        { role: 'user', content: 'second' },
      ]);

      expect(mockSendAndWait).toHaveBeenCalledWith({ prompt: 'first\nack\nsecond' });
    });

    it('disconnects session after chat', async () => {
      const adapter = new CopilotSDKInference();
      await adapter.chat([{ role: 'user', content: 'test' }]);
      expect(mockDisconnect).toHaveBeenCalledOnce();
    });

    it('disconnects session even if sendAndWait throws', async () => {
      mockSendAndWait.mockRejectedValue(new Error('chat failed'));

      const adapter = new CopilotSDKInference();
      await expect(
        adapter.chat([{ role: 'user', content: 'test' }])
      ).rejects.toThrow('chat failed');
      expect(mockDisconnect).toHaveBeenCalledOnce();
    });

    it('handles null response gracefully', async () => {
      mockSendAndWait.mockResolvedValue(null);

      const adapter = new CopilotSDKInference();
      const result = await adapter.chat([{ role: 'user', content: 'test' }]);
      expect(result).toBe('');
    });

    it('sets onPermissionRequest to auto-approve', async () => {
      const adapter = new CopilotSDKInference();
      await adapter.chat([{ role: 'user', content: 'test' }]);

      const sessionOpts = mockCreateSession.mock.calls[0][0];
      const result = await sessionOpts.onPermissionRequest();
      expect(result).toEqual({ kind: 'approved' });
    });
  });

  describe('embed()', () => {
    it('delegates to fallback adapter when provided', async () => {
      const mockFallback: InferenceAdapter = {
        name: 'mock-fallback',
        chat: vi.fn(),
        embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
        estimateCost: vi.fn().mockReturnValue(0),
      };
      const adapter = new CopilotSDKInference(mockFallback);
      const result = await adapter.embed('test text');
      expect(result).toEqual([0.1, 0.2, 0.3]);
      expect(mockFallback.embed).toHaveBeenCalledWith('test text');
    });

    it('throws AdapterNotAvailableError when no fallback is provided', async () => {
      const adapter = new CopilotSDKInference();
      await expect(adapter.embed('text')).rejects.toThrow(AdapterNotAvailableError);
    });

    it('error message mentions embeddings not supported', async () => {
      const adapter = new CopilotSDKInference();
      try {
        await adapter.embed('text');
      } catch (e) {
        expect((e as Error).message).toContain('embeddings');
      }
    });
  });

  describe('estimateCost()', () => {
    it('always returns 0', () => {
      const adapter = new CopilotSDKInference();
      expect(adapter.estimateCost(0)).toBe(0);
      expect(adapter.estimateCost(9999)).toBe(0);
    });
  });
});
