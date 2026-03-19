import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

});
