import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AdapterNotAvailableError } from '../../src/errors.js';
import type { InferenceAdapter } from '../../src/types.js';

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
    it('calls execFileSync with gh copilot -p and the prompt', async () => {
      mockExecFileSync.mockReturnValue('some output\n');
      const adapter = new CopilotInference();
      const result = await adapter.chat([{ role: 'user', content: 'hello' }]);
      expect(mockExecFileSync).toHaveBeenCalledWith('gh', ['copilot', '-p', 'hello'], { encoding: 'utf-8' });
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
      const prompt = args[2];
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

  describe('embed()', () => {
    it('delegates to fallback adapter when provided', async () => {
      const mockFallback: InferenceAdapter = {
        name: 'mock-fallback',
        chat: vi.fn(),
        embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
        estimateCost: vi.fn().mockReturnValue(0),
      };
      const adapter = new CopilotInference(mockFallback);
      const result = await adapter.embed('test text');
      expect(result).toEqual([0.1, 0.2, 0.3]);
      expect(mockFallback.embed).toHaveBeenCalledWith('test text');
    });

    it('throws AdapterNotAvailableError when no fallback is provided', async () => {
      const adapter = new CopilotInference();
      await expect(adapter.embed('text')).rejects.toThrow(AdapterNotAvailableError);
    });

    it('error message mentions embeddings not supported', async () => {
      const adapter = new CopilotInference();
      try {
        await adapter.embed('text');
      } catch (e) {
        expect((e as Error).message).toContain('embeddings');
      }
    });
  });

  describe('estimateCost()', () => {
    it('always returns 0', () => {
      const adapter = new CopilotInference();
      expect(adapter.estimateCost(0)).toBe(0);
      expect(adapter.estimateCost(9999)).toBe(0);
    });
  });

  describe('name', () => {
    it('is "copilot"', () => {
      const adapter = new CopilotInference();
      expect(adapter.name).toBe('copilot');
    });
  });
});
