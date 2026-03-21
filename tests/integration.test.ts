import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { evalCommand } from '../src/commands/eval.js';
import type { Harness, HarnessRunResult, InferenceAdapter } from '../src/types.js';

describe('Full workflow: eval with pre-written evals.json', () => {
  let tmpDir: string;

  const mockInference: InferenceAdapter = {
    name: 'mock',
    chat: vi.fn(),
  };

  const mockResult: HarnessRunResult = {
    raw: 'Good day, Eleanor. It is a pleasure to make your acquaintance.',
    files: [],
    total_tokens: 100,
    duration_ms: 2000,
  };

  const mockHarness: Harness = {
    name: 'mock',
    run: vi.fn().mockResolvedValue(mockResult),
    isAvailable: vi.fn().mockResolvedValue(true),
  };

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('eval produces all spec artifacts from pre-written evals.json', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapeval-integ-'));
    const skillDir = path.join(tmpDir, 'greeter');
    const evalsDir = path.join(skillDir, 'evals');
    fs.mkdirSync(evalsDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Greeter\nGreets people formally');

    // Write evals.json directly (no init step)
    const evalsFile = {
      skill_name: 'greeter',
      evals: [
        { id: 1, prompt: 'Greet Eleanor formally', expected_output: 'Formal greeting', slug: 'greet-eleanor', assertions: ['Output contains "Eleanor"'] },
        { id: 2, prompt: 'Hey there', expected_output: 'Default greeting', slug: 'casual-greeting' },
      ],
    };
    fs.writeFileSync(path.join(evalsDir, 'evals.json'), JSON.stringify(evalsFile, null, 2));

    // Mock inference for grading
    vi.mocked(mockInference.chat).mockResolvedValue(JSON.stringify({
      results: [
        { text: 'Output contains "Eleanor"', passed: true, evidence: 'Found "Eleanor" in output' },
      ],
    }));

    // Eval
    const workspaceDir = path.join(tmpDir, 'greeter-workspace');
    const results = await evalCommand(skillDir, mockHarness, mockInference, {
      workspace: workspaceDir,
      runs: 1,
    });

    // Verify workspace structure
    expect(results.iterationDir).toContain('iteration-1');
    expect(fs.existsSync(path.join(results.iterationDir, 'benchmark.json'))).toBe(true);

    // Verify per-eval artifacts
    const evalDir1 = path.join(results.iterationDir, 'eval-greet-eleanor');
    expect(fs.existsSync(path.join(evalDir1, 'with_skill', 'timing.json'))).toBe(true);
    expect(fs.existsSync(path.join(evalDir1, 'without_skill', 'timing.json'))).toBe(true);
    expect(fs.existsSync(path.join(evalDir1, 'with_skill', 'grading.json'))).toBe(true);
    expect(fs.existsSync(path.join(evalDir1, 'with_skill', 'outputs', 'output.txt'))).toBe(true);

    // Verify benchmark
    const benchmark = JSON.parse(fs.readFileSync(path.join(results.iterationDir, 'benchmark.json'), 'utf-8'));
    expect(benchmark.run_summary).toHaveProperty('with_skill');
    expect(benchmark.run_summary).toHaveProperty('without_skill');
    expect(benchmark.run_summary).toHaveProperty('delta');

    // Verify results object
    expect(results.evalRuns).toHaveLength(2);
    expect(results.skillName).toBe('greeter');
    expect(results.evalRuns[0].withSkill.grading?.summary.passed).toBe(1);
  });
});
