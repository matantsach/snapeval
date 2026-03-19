import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { evalCommand } from '../../src/commands/eval.js';
import type { Harness, HarnessRunResult, InferenceAdapter } from '../../src/types.js';

describe('evalCommand', () => {
  let tmpDir: string;

  const mockResult: HarnessRunResult = {
    raw: 'Good day, Eleanor.',
    files: [],
    total_tokens: 100,
    duration_ms: 2000,
  };

  const mockHarness: Harness = {
    name: 'mock',
    run: vi.fn().mockResolvedValue(mockResult),
    isAvailable: vi.fn().mockResolvedValue(true),
  };

  const mockInference: InferenceAdapter = {
    name: 'mock',
    chat: vi.fn().mockResolvedValue(JSON.stringify({
      results: [
        { text: 'Contains Eleanor', passed: true, evidence: 'Found "Eleanor" in output' },
      ],
    })),
  };

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('creates iteration dir and produces all spec artifacts', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-cmd-'));
    const skillDir = path.join(tmpDir, 'greeter');
    fs.mkdirSync(path.join(skillDir, 'evals'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Greeter');
    fs.writeFileSync(path.join(skillDir, 'evals', 'evals.json'), JSON.stringify({
      skill_name: 'greeter',
      evals: [
        { id: 1, prompt: 'Greet Eleanor', expected_output: 'Formal greeting', slug: 'greet-eleanor',
          assertions: ['Contains Eleanor'] },
      ],
    }));

    const results = await evalCommand(skillDir, mockHarness, mockInference, {
      workspace: path.join(tmpDir, 'greeter-workspace'),
      runs: 1,
    });

    expect(results.iterationDir).toContain('iteration-1');

    const evalDir = path.join(results.iterationDir, 'eval-greet-eleanor');
    expect(fs.existsSync(path.join(evalDir, 'with_skill', 'timing.json'))).toBe(true);
    expect(fs.existsSync(path.join(evalDir, 'without_skill', 'timing.json'))).toBe(true);
    expect(fs.existsSync(path.join(evalDir, 'with_skill', 'grading.json'))).toBe(true);
    expect(fs.existsSync(path.join(results.iterationDir, 'benchmark.json'))).toBe(true);

    expect(results.skillName).toBe('greeter');
    expect(results.evalRuns).toHaveLength(1);
    expect(results.benchmark.run_summary.delta).toBeDefined();
  });
});
