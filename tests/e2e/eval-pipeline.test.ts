/**
 * E2E tests for the snapeval eval pipeline.
 *
 * These test the full init → eval → review workflow using mocked
 * harness and inference adapters, verifying that all agentskills.io
 * spec artifacts are produced correctly.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { initCommand } from '../../src/commands/init.js';
import { evalCommand } from '../../src/commands/eval.js';
import { reviewCommand } from '../../src/commands/review.js';
import type {
  Harness,
  HarnessRunResult,
  InferenceAdapter,
  EvalsFile,
  GradingResult,
  BenchmarkData,
  TimingData,
} from '../../src/types.js';

// Mock only execFile (used by openInBrowser in review), keep execFileSync real (used by script grading)
const actualChildProcess = await vi.importActual<typeof import('node:child_process')>('node:child_process');
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return { ...actual, execFile: vi.fn() };
});

describe('E2E: init → eval → review pipeline', () => {
  let tmpDir: string;

  const withSkillOutput: HarnessRunResult = {
    raw: 'Good day, Eleanor. It is a pleasure to make your acquaintance.',
    files: [],
    total_tokens: 850,
    duration_ms: 12000,
  };

  const withoutSkillOutput: HarnessRunResult = {
    raw: 'Hello Eleanor.',
    files: [],
    total_tokens: 200,
    duration_ms: 3000,
  };

  const mockHarness: Harness = {
    name: 'mock-harness',
    run: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(true),
  };

  const mockInference: InferenceAdapter = {
    name: 'mock-inference',
    chat: vi.fn(),
  };

  function setupSkillDir(): string {
    const skillDir = path.join(tmpDir, 'greeter');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '# Greeter\n\nGreets people formally with their name.'
    );
    return skillDir;
  }

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('full pipeline: init generates evals, eval produces spec artifacts, review creates feedback', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapeval-e2e-'));
    const skillDir = setupSkillDir();
    const workspaceDir = path.join(tmpDir, 'greeter-workspace');

    // --- Phase 1: init ---
    vi.mocked(mockInference.chat).mockResolvedValueOnce(
      JSON.stringify({
        skill_name: 'greeter',
        evals: [
          { id: 1, prompt: 'Greet Eleanor formally', expected_output: 'Formal greeting with name', slug: 'greet-eleanor' },
          { id: 2, prompt: 'Say hi casually', expected_output: 'Casual greeting', slug: 'casual-hi' },
        ],
      })
    );

    await initCommand(skillDir, mockInference);

    const evalsPath = path.join(skillDir, 'evals', 'evals.json');
    expect(fs.existsSync(evalsPath)).toBe(true);

    const evalsFile: EvalsFile = JSON.parse(fs.readFileSync(evalsPath, 'utf-8'));
    expect(evalsFile.skill_name).toBe('greeter');
    expect(evalsFile).not.toHaveProperty('generated_by');
    expect(evalsFile.evals).toHaveLength(2);
    expect(evalsFile.evals[0].slug).toBe('greet-eleanor');
    expect(evalsFile.evals[0]).not.toHaveProperty('assertions');

    // --- Phase 2: User adds assertions (simulated) ---
    evalsFile.evals[0].assertions = [
      'Output contains "Eleanor"',
      'Output uses formal tone',
    ];
    evalsFile.evals[1].assertions = [
      'Output is a greeting',
    ];
    fs.writeFileSync(evalsPath, JSON.stringify(evalsFile, null, 2));

    // --- Phase 3: eval ---
    // Harness: alternates with_skill and without_skill outputs
    vi.mocked(mockHarness.run)
      .mockResolvedValueOnce(withSkillOutput)    // eval 1, with_skill
      .mockResolvedValueOnce(withoutSkillOutput) // eval 1, without_skill
      .mockResolvedValueOnce(withSkillOutput)    // eval 2, with_skill
      .mockResolvedValueOnce(withoutSkillOutput); // eval 2, without_skill

    // Inference for grading (4 calls: 2 evals × 2 variants)
    vi.mocked(mockInference.chat)
      .mockResolvedValueOnce(JSON.stringify({
        results: [
          { text: 'Output contains "Eleanor"', passed: true, evidence: 'Found "Eleanor" in output' },
          { text: 'Output uses formal tone', passed: true, evidence: '"Good day" and "pleasure" indicate formal tone' },
        ],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        results: [
          { text: 'Output contains "Eleanor"', passed: true, evidence: 'Found "Eleanor" in output' },
          { text: 'Output uses formal tone', passed: false, evidence: '"Hello" is not formal' },
        ],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        results: [
          { text: 'Output is a greeting', passed: true, evidence: 'Output starts with "Good day"' },
        ],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        results: [
          { text: 'Output is a greeting', passed: true, evidence: 'Output starts with "Hello"' },
        ],
      }));

    const evalResults = await evalCommand(skillDir, mockHarness, mockInference, {
      workspace: workspaceDir,
      runs: 1,
    });

    // Verify iteration directory
    expect(evalResults.iterationDir).toContain('iteration-1');
    expect(fs.existsSync(evalResults.iterationDir)).toBe(true);

    // Verify eval-level directory structure
    const eval1Dir = path.join(evalResults.iterationDir, 'eval-greet-eleanor');
    const eval2Dir = path.join(evalResults.iterationDir, 'eval-casual-hi');
    expect(fs.existsSync(eval1Dir)).toBe(true);
    expect(fs.existsSync(eval2Dir)).toBe(true);

    // Verify timing.json per run (spec artifact)
    const timing1ws: TimingData = JSON.parse(
      fs.readFileSync(path.join(eval1Dir, 'with_skill', 'timing.json'), 'utf-8')
    );
    expect(timing1ws.total_tokens).toBe(850);
    expect(timing1ws.duration_ms).toBe(12000);

    const timing1wos: TimingData = JSON.parse(
      fs.readFileSync(path.join(eval1Dir, 'without_skill', 'timing.json'), 'utf-8')
    );
    expect(timing1wos.total_tokens).toBe(200);
    expect(timing1wos.duration_ms).toBe(3000);

    // Verify grading.json per run (spec artifact)
    const grading1ws: GradingResult = JSON.parse(
      fs.readFileSync(path.join(eval1Dir, 'with_skill', 'grading.json'), 'utf-8')
    );
    expect(grading1ws.assertion_results).toHaveLength(2);
    expect(grading1ws.summary.passed).toBe(2);
    expect(grading1ws.summary.failed).toBe(0);
    expect(grading1ws.summary.pass_rate).toBe(1.0);

    const grading1wos: GradingResult = JSON.parse(
      fs.readFileSync(path.join(eval1Dir, 'without_skill', 'grading.json'), 'utf-8')
    );
    expect(grading1wos.summary.passed).toBe(1);
    expect(grading1wos.summary.failed).toBe(1);
    expect(grading1wos.summary.pass_rate).toBe(0.5);

    // Verify output.txt written
    const output1ws = fs.readFileSync(
      path.join(eval1Dir, 'with_skill', 'outputs', 'output.txt'), 'utf-8'
    );
    expect(output1ws).toContain('Eleanor');

    // Verify benchmark.json (spec artifact)
    const benchmark: BenchmarkData = JSON.parse(
      fs.readFileSync(path.join(evalResults.iterationDir, 'benchmark.json'), 'utf-8')
    );
    expect(benchmark.run_summary.with_skill.pass_rate.mean).toBeGreaterThan(0);
    expect(benchmark.run_summary.without_skill.pass_rate.mean).toBeGreaterThan(0);
    expect(benchmark.run_summary.delta.pass_rate).toBeGreaterThan(0);
    expect(benchmark.run_summary.delta.tokens).toBeGreaterThan(0);

    // Verify results object
    expect(evalResults.skillName).toBe('greeter');
    expect(evalResults.evalRuns).toHaveLength(2);
    expect(evalResults.evalRuns[0].withSkill.grading!.summary.pass_rate).toBe(1.0);
    expect(evalResults.evalRuns[0].withoutSkill.grading!.summary.pass_rate).toBe(0.5);

    // --- Phase 4: review ---
    // Reset mocks for a second eval run inside review
    vi.mocked(mockHarness.run)
      .mockResolvedValueOnce(withSkillOutput)
      .mockResolvedValueOnce(withoutSkillOutput)
      .mockResolvedValueOnce(withSkillOutput)
      .mockResolvedValueOnce(withoutSkillOutput);

    vi.mocked(mockInference.chat)
      .mockResolvedValue(JSON.stringify({
        results: [{ text: 'test', passed: true, evidence: 'ok' }],
      }));

    await reviewCommand(skillDir, mockHarness, mockInference, {
      workspace: workspaceDir,
      runs: 1,
      noOpen: true,
    });

    // Review creates iteration-2
    const iter2Dir = path.join(workspaceDir, 'iteration-2');
    expect(fs.existsSync(iter2Dir)).toBe(true);

    // Verify feedback.json template
    const feedbackPath = path.join(iter2Dir, 'feedback.json');
    expect(fs.existsSync(feedbackPath)).toBe(true);
    const feedback = JSON.parse(fs.readFileSync(feedbackPath, 'utf-8'));
    expect(feedback).toHaveProperty('eval-greet-eleanor');
    expect(feedback).toHaveProperty('eval-casual-hi');
    expect(feedback['eval-greet-eleanor']).toBe('');
    expect(feedback['eval-casual-hi']).toBe('');
  });

  it('eval without assertions produces timing but no grading', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapeval-e2e-noassert-'));
    const skillDir = setupSkillDir();
    const workspaceDir = path.join(tmpDir, 'greeter-workspace');

    // Write evals.json without assertions
    const evalsDir = path.join(skillDir, 'evals');
    fs.mkdirSync(evalsDir, { recursive: true });
    fs.writeFileSync(path.join(evalsDir, 'evals.json'), JSON.stringify({
      skill_name: 'greeter',
      evals: [
        { id: 1, prompt: 'Greet Eleanor', expected_output: 'A greeting', slug: 'greet-eleanor' },
      ],
    }));

    vi.mocked(mockHarness.run)
      .mockResolvedValueOnce(withSkillOutput)
      .mockResolvedValueOnce(withoutSkillOutput);

    const results = await evalCommand(skillDir, mockHarness, mockInference, {
      workspace: workspaceDir,
      runs: 1,
    });

    const evalDir = path.join(results.iterationDir, 'eval-greet-eleanor');

    // timing.json written
    expect(fs.existsSync(path.join(evalDir, 'with_skill', 'timing.json'))).toBe(true);
    expect(fs.existsSync(path.join(evalDir, 'without_skill', 'timing.json'))).toBe(true);

    // grading.json NOT written (no assertions)
    expect(fs.existsSync(path.join(evalDir, 'with_skill', 'grading.json'))).toBe(false);
    expect(fs.existsSync(path.join(evalDir, 'without_skill', 'grading.json'))).toBe(false);

    // benchmark has 0 pass rate (no assertions means default 0)
    expect(results.benchmark.run_summary.with_skill.pass_rate.mean).toBe(0);

    // Inference was NOT called (no grading needed)
    expect(mockInference.chat).not.toHaveBeenCalled();
  });

  it('eval with --old-skill uses old_skill directory variant', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapeval-e2e-oldskill-'));
    const skillDir = setupSkillDir();
    const oldSkillDir = path.join(tmpDir, 'greeter-old');
    fs.mkdirSync(oldSkillDir, { recursive: true });
    fs.writeFileSync(path.join(oldSkillDir, 'SKILL.md'), '# Greeter v1\nOld greeter.');
    const workspaceDir = path.join(tmpDir, 'greeter-workspace');

    const evalsDir = path.join(skillDir, 'evals');
    fs.mkdirSync(evalsDir, { recursive: true });
    fs.writeFileSync(path.join(evalsDir, 'evals.json'), JSON.stringify({
      skill_name: 'greeter',
      evals: [
        { id: 1, prompt: 'Greet Eleanor', expected_output: 'A greeting', slug: 'greet-eleanor' },
      ],
    }));

    vi.mocked(mockHarness.run)
      .mockResolvedValueOnce(withSkillOutput)
      .mockResolvedValueOnce(withoutSkillOutput);

    const results = await evalCommand(skillDir, mockHarness, mockInference, {
      workspace: workspaceDir,
      runs: 1,
      oldSkill: oldSkillDir,
    });

    const evalDir = path.join(results.iterationDir, 'eval-greet-eleanor');

    // old_skill variant used instead of without_skill
    expect(fs.existsSync(path.join(evalDir, 'old_skill', 'timing.json'))).toBe(true);
    expect(fs.existsSync(path.join(evalDir, 'old_skill', 'outputs', 'output.txt'))).toBe(true);
    expect(fs.existsSync(path.join(evalDir, 'without_skill'))).toBe(false);

    // Harness was called with old skill path for baseline
    const secondCall = vi.mocked(mockHarness.run).mock.calls[1][0];
    expect(secondCall.skillPath).toBe(oldSkillDir);
  });

  it('multiple iterations increment correctly', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapeval-e2e-iters-'));
    const skillDir = setupSkillDir();
    const workspaceDir = path.join(tmpDir, 'greeter-workspace');

    const evalsDir = path.join(skillDir, 'evals');
    fs.mkdirSync(evalsDir, { recursive: true });
    fs.writeFileSync(path.join(evalsDir, 'evals.json'), JSON.stringify({
      skill_name: 'greeter',
      evals: [
        { id: 1, prompt: 'Greet', expected_output: 'A greeting', slug: 'greet' },
      ],
    }));

    vi.mocked(mockHarness.run).mockResolvedValue(withSkillOutput);

    // Run 3 iterations
    const r1 = await evalCommand(skillDir, mockHarness, mockInference, { workspace: workspaceDir });
    const r2 = await evalCommand(skillDir, mockHarness, mockInference, { workspace: workspaceDir });
    const r3 = await evalCommand(skillDir, mockHarness, mockInference, { workspace: workspaceDir });

    expect(r1.iterationDir).toContain('iteration-1');
    expect(r2.iterationDir).toContain('iteration-2');
    expect(r3.iterationDir).toContain('iteration-3');

    // All three have benchmark.json
    expect(fs.existsSync(path.join(r1.iterationDir, 'benchmark.json'))).toBe(true);
    expect(fs.existsSync(path.join(r2.iterationDir, 'benchmark.json'))).toBe(true);
    expect(fs.existsSync(path.join(r3.iterationDir, 'benchmark.json'))).toBe(true);
  });

  it('script-based assertions are executed', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapeval-e2e-script-'));
    const skillDir = setupSkillDir();
    const workspaceDir = path.join(tmpDir, 'greeter-workspace');

    // Create evals with a script assertion
    const evalsDir = path.join(skillDir, 'evals');
    const scriptsDir = path.join(evalsDir, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(scriptsDir, 'check-name.sh'),
      '#!/bin/bash\ngrep -q "Eleanor" "$1/output.txt" && echo "Found Eleanor" || (echo "Eleanor not found"; exit 1)',
      { mode: 0o755 }
    );
    fs.writeFileSync(path.join(evalsDir, 'evals.json'), JSON.stringify({
      skill_name: 'greeter',
      evals: [
        {
          id: 1, prompt: 'Greet Eleanor', expected_output: 'Greeting',
          slug: 'greet-eleanor',
          assertions: ['script:check-name.sh', 'Output is polite'],
        },
      ],
    }));

    vi.mocked(mockHarness.run)
      .mockResolvedValueOnce(withSkillOutput)
      .mockResolvedValueOnce(withoutSkillOutput);

    // LLM grading for the non-script assertion
    vi.mocked(mockInference.chat)
      .mockResolvedValue(JSON.stringify({
        results: [{ text: 'Output is polite', passed: true, evidence: 'Uses "pleasure"' }],
      }));

    const results = await evalCommand(skillDir, mockHarness, mockInference, {
      workspace: workspaceDir,
    });

    const evalDir = path.join(results.iterationDir, 'eval-greet-eleanor');
    const grading: GradingResult = JSON.parse(
      fs.readFileSync(path.join(evalDir, 'with_skill', 'grading.json'), 'utf-8')
    );

    // Script assertion ran and passed (output contains Eleanor)
    const scriptResult = grading.assertion_results.find(a => a.text === 'script:check-name.sh');
    expect(scriptResult).toBeDefined();
    expect(scriptResult!.passed).toBe(true);
    expect(scriptResult!.evidence).toContain('Found Eleanor');

    // LLM assertion also present
    const llmResult = grading.assertion_results.find(a => a.text === 'Output is polite');
    expect(llmResult).toBeDefined();
    expect(llmResult!.passed).toBe(true);

    expect(grading.summary.total).toBe(2);
    expect(grading.summary.passed).toBe(2);
  });
});
