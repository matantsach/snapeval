import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { initCommand } from '../src/commands/init.js';
import { evalCommand } from '../src/commands/eval.js';
import type { Harness, HarnessRunResult, InferenceAdapter } from '../src/types.js';

describe('Full workflow: init → eval', () => {
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

  it('init generates evals.json, eval produces all spec artifacts', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapeval-integ-'));
    const skillDir = path.join(tmpDir, 'greeter');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Greeter\nGreets people formally');

    // Mock inference for init
    vi.mocked(mockInference.chat).mockResolvedValueOnce(JSON.stringify({
      skill_name: 'greeter',
      evals: [
        { id: 1, prompt: 'Greet Eleanor formally', expected_output: 'Formal greeting', slug: 'greet-eleanor' },
        { id: 2, prompt: 'Hey there', expected_output: 'Default greeting', slug: 'casual-greeting' },
      ],
    }));

    // Init
    await initCommand(skillDir, mockInference);
    const evalsPath = path.join(skillDir, 'evals', 'evals.json');
    expect(fs.existsSync(evalsPath)).toBe(true);
    const evalsFile = JSON.parse(fs.readFileSync(evalsPath, 'utf-8'));
    expect(evalsFile).not.toHaveProperty('generated_by');
    expect(evalsFile.evals).toHaveLength(2);

    // Add assertions manually (simulating user adding after first run)
    evalsFile.evals[0].assertions = ['Output contains "Eleanor"'];
    fs.writeFileSync(evalsPath, JSON.stringify(evalsFile, null, 2));

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
