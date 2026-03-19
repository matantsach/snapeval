import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CopilotCLIHarness } from '../../../src/adapters/harness/copilot-cli.js';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
  execFileSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  copyFileSync: vi.fn(),
}));

import { execFile, execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

describe('CopilotCLIHarness', () => {
  const harness = new CopilotCLIHarness();

  beforeEach(() => { vi.clearAllMocks(); });

  it('has name copilot-cli', () => {
    expect(harness.name).toBe('copilot-cli');
  });

  it('run with skillPath includes SKILL.md in prompt', async () => {
    vi.mocked(readFile).mockResolvedValue('# My Skill\nDo things');
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb: any) => {
      cb(null, 'skill output', '');
      return {} as any;
    });
    vi.mocked(execFileSync).mockReturnValue('1.0.0');

    const result = await harness.run({
      skillPath: '/path/to/skill',
      prompt: 'test prompt',
      outputDir: '/tmp/out',
    });

    expect(result.raw).toBe('skill output');
    expect(result.total_tokens).toBe(0);
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    expect(result.files).toEqual([]);

    const callArgs = vi.mocked(execFile).mock.calls[0];
    const promptArg = callArgs[1]![callArgs[1]!.length - 1] as string;
    expect(promptArg).toContain('# My Skill');
    expect(promptArg).toContain('test prompt');
  });

  it('run without skillPath does not include SKILL.md', async () => {
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb: any) => {
      cb(null, 'bare output', '');
      return {} as any;
    });
    vi.mocked(execFileSync).mockReturnValue('1.0.0');

    const result = await harness.run({
      prompt: 'test prompt',
      outputDir: '/tmp/out',
    });

    expect(result.raw).toBe('bare output');
  });

  it('isAvailable checks copilot --version', async () => {
    vi.mocked(execFileSync).mockReturnValue('1.0.0');
    expect(await harness.isAvailable()).toBe(true);

    vi.mocked(execFileSync).mockImplementation(() => { throw new Error('not found'); });
    expect(await harness.isAvailable()).toBe(false);
  });
});
