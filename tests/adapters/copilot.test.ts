import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We mock child_process before importing the module under test
const mockExecFileSync = vi.fn();
vi.mock('node:child_process', () => ({ execFileSync: mockExecFileSync }));

// Dynamic import after mock is set up
const { CopilotInference } = await import('../../src/adapters/inference/copilot.js');

describe('CopilotInference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('chat()', () => {
    it('calls execFileSync with copilot flags before -p prompt', async () => {
      mockExecFileSync.mockReturnValue('some output\n');
      const adapter = new CopilotInference();
      const result = await adapter.chat([{ role: 'user', content: 'hello' }]);
      expect(mockExecFileSync).toHaveBeenCalledWith('copilot', ['-s', '--no-ask-user', '--model', 'gpt-4.1', '-p', 'hello'], { encoding: 'utf-8' });
      expect(result).toBe('some output');
    });

    it('trims whitespace from stdout', async () => {
      mockExecFileSync.mockReturnValue('  trimmed output  \n\n');
      const adapter = new CopilotInference();
      const result = await adapter.chat([{ role: 'user', content: 'test' }]);
      expect(result).toBe('trimmed output');
    });

    it('concatenates multiple messages into prompt', async () => {
      mockExecFileSync.mockReturnValue('ok');
      const adapter = new CopilotInference();
      await adapter.chat([
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'What is 2+2?' },
      ]);
      const [, args] = mockExecFileSync.mock.calls[0] as [string, string[]];
      // -p is second-to-last, prompt is last
      const prompt = args[args.length - 1];
      expect(prompt).toContain('You are helpful.');
      expect(prompt).toContain('What is 2+2?');
    });

    it('propagates errors thrown by execFileSync', async () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('gh not found');
      });
      const adapter = new CopilotInference();
      await expect(adapter.chat([{ role: 'user', content: 'test' }])).rejects.toThrow('gh not found');
    });
  });

  describe('name', () => {
    it('is "copilot"', () => {
      const adapter = new CopilotInference();
      expect(adapter.name).toBe('copilot');
    });
  });
});
