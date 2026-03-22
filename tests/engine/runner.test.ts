import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runEval } from '../../src/engine/runner.js';
import type { Harness, HarnessRunResult, EvalCase } from '../../src/types.js';

describe('runEval', () => {
  let tmpDir: string;

  const mockResult: HarnessRunResult = {
    raw: 'test output',
    files: [],
    total_tokens: 500,
    duration_ms: 2000,
  };

  const mockHarness: Harness = {
    name: 'mock',
    run: vi.fn().mockResolvedValue(mockResult),
    isAvailable: vi.fn().mockResolvedValue(true),
  };

  const evalCase: EvalCase = {
    id: 1,
    prompt: 'Analyze this CSV',
    expected_output: 'A chart with labeled axes',
    slug: 'analyze-csv',
  };

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('runs with_skill and without_skill, writes timing.json', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-'));
    const evalDir = path.join(tmpDir, 'eval-analyze-csv');
    fs.mkdirSync(path.join(evalDir, 'with_skill', 'outputs'), { recursive: true });
    fs.mkdirSync(path.join(evalDir, 'without_skill', 'outputs'), { recursive: true });

    const result = await runEval(evalCase, '/path/to/skill', evalDir, mockHarness);

    expect(mockHarness.run).toHaveBeenCalledTimes(2);
    expect(vi.mocked(mockHarness.run).mock.calls[0][0].skillPath).toBe('/path/to/skill');
    expect(vi.mocked(mockHarness.run).mock.calls[1][0].skillPath).toBeUndefined();

    const withTiming = JSON.parse(fs.readFileSync(path.join(evalDir, 'with_skill', 'timing.json'), 'utf-8'));
    expect(withTiming).toEqual({ total_tokens: 500, duration_ms: 2000 });

    const withoutTiming = JSON.parse(fs.readFileSync(path.join(evalDir, 'without_skill', 'timing.json'), 'utf-8'));
    expect(withoutTiming).toEqual({ total_tokens: 500, duration_ms: 2000 });

    expect(fs.existsSync(path.join(evalDir, 'with_skill', 'outputs', 'output.txt'))).toBe(true);
    expect(fs.existsSync(path.join(evalDir, 'without_skill', 'outputs', 'output.txt'))).toBe(true);

    expect(result.withSkill.output.raw).toBe('test output');
    expect(result.withoutSkill.output.raw).toBe('test output');
  });

  it('writes transcript.log when transcript is available', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-'));
    const evalDir = path.join(tmpDir, 'eval-test');
    fs.mkdirSync(path.join(evalDir, 'with_skill', 'outputs'), { recursive: true });
    fs.mkdirSync(path.join(evalDir, 'without_skill', 'outputs'), { recursive: true });

    const resultWithTranscript: HarnessRunResult = {
      ...mockResult,
      transcript: 'Step 1: Read file\nStep 2: Generate chart',
    };
    vi.mocked(mockHarness.run).mockResolvedValue(resultWithTranscript);

    await runEval(evalCase, '/path/to/skill', evalDir, mockHarness);

    expect(fs.existsSync(path.join(evalDir, 'with_skill', 'transcript.log'))).toBe(true);
  });

  it('uses old_skill directory when oldSkillPath is provided', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-'));
    const evalDir = path.join(tmpDir, 'eval-test');
    fs.mkdirSync(path.join(evalDir, 'with_skill', 'outputs'), { recursive: true });
    fs.mkdirSync(path.join(evalDir, 'old_skill', 'outputs'), { recursive: true });

    const result = await runEval(evalCase, '/path/to/skill', evalDir, mockHarness, '/path/to/old-skill');

    expect(mockHarness.run).toHaveBeenCalledTimes(2);
    expect(vi.mocked(mockHarness.run).mock.calls[0][0].skillPath).toBe('/path/to/skill');
    expect(vi.mocked(mockHarness.run).mock.calls[1][0].skillPath).toBe('/path/to/old-skill');

    expect(fs.existsSync(path.join(evalDir, 'old_skill', 'timing.json'))).toBe(true);
    expect(fs.existsSync(path.join(evalDir, 'old_skill', 'outputs', 'output.txt'))).toBe(true);
  });
});
