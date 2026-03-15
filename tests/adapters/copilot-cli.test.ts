import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockExecFile = vi.fn();
const mockExecFileSync = vi.fn();

vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
  execFileSync: mockExecFileSync,
}));

const { CopilotCLIAdapter } = await import('../../src/adapters/skill/copilot-cli.js');

describe('CopilotCLIAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('invoke()', () => {
    it('calls execFile with copilot -p prompt -s --no-ask-user --allow-all-tools --model gpt-4.1', async () => {
      mockExecFileSync.mockReturnValue('copilot 1.0.0');
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        callback(null, 'skill output\n', '');
      });

      const adapter = new CopilotCLIAdapter();
      await adapter.invoke('/path/to/skill', 'what is the answer?');

      expect(mockExecFile).toHaveBeenCalledOnce();
      const [cmd, args] = mockExecFile.mock.calls[0] as [string, string[]];
      expect(cmd).toBe('copilot');
      expect(args).toContain('-p');
      expect(args).toContain('-s');
      expect(args).toContain('--no-ask-user');
      expect(args).toContain('--allow-all-tools');
      expect(args).toContain('--model');
      expect(args).toContain('gpt-4.1');
    });

    it('returns trimmed stdout as raw output', async () => {
      mockExecFileSync.mockReturnValue('copilot 1.0.0');
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        callback(null, '  trimmed output  \n', '');
      });

      const adapter = new CopilotCLIAdapter();
      const result = await adapter.invoke('/skill', 'prompt');
      expect(result.raw).toBe('trimmed output');
    });

    it('records durationMs in metadata', async () => {
      mockExecFileSync.mockReturnValue('copilot 1.0.0');
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        callback(null, 'output', '');
      });

      const adapter = new CopilotCLIAdapter();
      const result = await adapter.invoke('/skill', 'prompt');
      expect(result.metadata.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.metadata.durationMs).toBe('number');
    });

    it('sets adapter to "copilot-cli" in metadata', async () => {
      mockExecFileSync.mockReturnValue('copilot 1.0.0');
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        callback(null, 'output', '');
      });

      const adapter = new CopilotCLIAdapter();
      const result = await adapter.invoke('/skill', 'prompt');
      expect(result.metadata.adapter).toBe('copilot-cli');
    });

    it('sets model to "copilot" in metadata', async () => {
      mockExecFileSync.mockReturnValue('copilot 1.0.0');
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        callback(null, 'output', '');
      });

      const adapter = new CopilotCLIAdapter();
      const result = await adapter.invoke('/skill', 'prompt');
      expect(result.metadata.model).toBe('copilot');
    });

    it('rejects on execFile error', async () => {
      mockExecFileSync.mockReturnValue('copilot 1.0.0');
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        callback(new Error('command failed'), '', 'error output');
      });

      const adapter = new CopilotCLIAdapter();
      await expect(adapter.invoke('/skill', 'prompt')).rejects.toThrow('command failed');
    });
  });

  describe('isAvailable()', () => {
    it('returns true when execFileSync succeeds', async () => {
      mockExecFileSync.mockReturnValue('copilot 1.0.0');
      const adapter = new CopilotCLIAdapter();
      const available = await adapter.isAvailable();
      expect(available).toBe(true);
    });

    it('returns false when execFileSync throws', async () => {
      mockExecFileSync.mockImplementation(() => { throw new Error('not found'); });
      const adapter = new CopilotCLIAdapter();
      const available = await adapter.isAvailable();
      expect(available).toBe(false);
    });

    it('calls copilot --version to check availability', async () => {
      mockExecFileSync.mockReturnValue('copilot 1.0.0');
      const adapter = new CopilotCLIAdapter();
      await adapter.isAvailable();
      expect(mockExecFileSync).toHaveBeenCalledWith('copilot', ['--version'], expect.any(Object));
    });
  });

  describe('name', () => {
    it('is "copilot-cli"', () => {
      const adapter = new CopilotCLIAdapter();
      expect(adapter.name).toBe('copilot-cli');
    });
  });
});
