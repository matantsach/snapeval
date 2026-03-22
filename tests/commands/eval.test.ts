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

  describe('validateEvalsFile', () => {
    it('throws on missing skill_name', async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-cmd-'));
      const skillDir = path.join(tmpDir, 'test-skill');
      fs.mkdirSync(path.join(skillDir, 'evals'), { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'evals', 'evals.json'), JSON.stringify({
        evals: [{ id: 1, prompt: 'test', expected_output: 'test' }],
      }));
      await expect(evalCommand(skillDir, mockHarness, mockInference, {
        workspace: path.join(tmpDir, 'ws'),
      })).rejects.toThrow(/missing or invalid "skill_name"/);
    });

    it('throws on non-array evals', async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-cmd-'));
      const skillDir = path.join(tmpDir, 'test-skill');
      fs.mkdirSync(path.join(skillDir, 'evals'), { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'evals', 'evals.json'), JSON.stringify({
        skill_name: 'test', evals: 'not-an-array',
      }));
      await expect(evalCommand(skillDir, mockHarness, mockInference, {
        workspace: path.join(tmpDir, 'ws'),
      })).rejects.toThrow(/"evals" must be an array/);
    });

    it('throws on missing eval id', async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-cmd-'));
      const skillDir = path.join(tmpDir, 'test-skill');
      fs.mkdirSync(path.join(skillDir, 'evals'), { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'evals', 'evals.json'), JSON.stringify({
        skill_name: 'test',
        evals: [{ prompt: 'test', expected_output: 'test' }],
      }));
      await expect(evalCommand(skillDir, mockHarness, mockInference, {
        workspace: path.join(tmpDir, 'ws'),
      })).rejects.toThrow(/missing or invalid "id"/);
    });

    it('throws on missing evals.json', async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-cmd-'));
      const skillDir = path.join(tmpDir, 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      await expect(evalCommand(skillDir, mockHarness, mockInference, {
        workspace: path.join(tmpDir, 'ws'),
      })).rejects.toThrow(/File not found/);
    });
  });

  describe('--only filtering', () => {
    it('filters to specified eval IDs', async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-cmd-'));
      const skillDir = path.join(tmpDir, 'test-skill');
      fs.mkdirSync(path.join(skillDir, 'evals'), { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'evals', 'evals.json'), JSON.stringify({
        skill_name: 'test',
        evals: [
          { id: 1, prompt: 'first', expected_output: 'one' },
          { id: 2, prompt: 'second', expected_output: 'two' },
          { id: 3, prompt: 'third', expected_output: 'three' },
        ],
      }));
      const results = await evalCommand(skillDir, mockHarness, mockInference, {
        workspace: path.join(tmpDir, 'ws'), only: [1, 3],
      });
      expect(results.evalRuns).toHaveLength(2);
      expect(results.evalRuns.map(r => r.evalId)).toEqual([1, 3]);
    });

    it('throws when no eval IDs match', async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-cmd-'));
      const skillDir = path.join(tmpDir, 'test-skill');
      fs.mkdirSync(path.join(skillDir, 'evals'), { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'evals', 'evals.json'), JSON.stringify({
        skill_name: 'test',
        evals: [{ id: 1, prompt: 'test', expected_output: 'test' }],
      }));
      await expect(evalCommand(skillDir, mockHarness, mockInference, {
        workspace: path.join(tmpDir, 'ws'), only: [99],
      })).rejects.toThrow(/No eval cases match/);
    });
  });

  describe('--threshold', () => {
    it('throws ThresholdError when pass rate is below threshold', async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-cmd-'));
      const skillDir = path.join(tmpDir, 'test-skill');
      fs.mkdirSync(path.join(skillDir, 'evals'), { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'evals', 'evals.json'), JSON.stringify({
        skill_name: 'test',
        evals: [{ id: 1, prompt: 'test', expected_output: 'test',
          assertions: ['always fails'] }],
      }));
      vi.mocked(mockInference.chat).mockResolvedValue(JSON.stringify({
        results: [{ text: 'always fails', passed: false, evidence: 'nope' }],
      }));
      await expect(evalCommand(skillDir, mockHarness, mockInference, {
        workspace: path.join(tmpDir, 'ws'), threshold: 0.8,
      })).rejects.toThrow(/below threshold/);
    });

    it('succeeds when pass rate meets threshold', async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-cmd-'));
      const skillDir = path.join(tmpDir, 'test-skill');
      fs.mkdirSync(path.join(skillDir, 'evals'), { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'evals', 'evals.json'), JSON.stringify({
        skill_name: 'test',
        evals: [{ id: 1, prompt: 'test', expected_output: 'test',
          assertions: ['passes'] }],
      }));
      vi.mocked(mockInference.chat).mockResolvedValue(JSON.stringify({
        results: [{ text: 'passes', passed: true, evidence: 'yes' }],
      }));
      const results = await evalCommand(skillDir, mockHarness, mockInference, {
        workspace: path.join(tmpDir, 'ws'), threshold: 0.5,
      });
      expect(results.evalRuns).toHaveLength(1);
    });

    it('throws on invalid threshold value', async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-cmd-'));
      const skillDir = path.join(tmpDir, 'test-skill');
      fs.mkdirSync(path.join(skillDir, 'evals'), { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'evals', 'evals.json'), JSON.stringify({
        skill_name: 'test',
        evals: [{ id: 1, prompt: 'test', expected_output: 'test' }],
      }));
      await expect(evalCommand(skillDir, mockHarness, mockInference, {
        workspace: path.join(tmpDir, 'ws'), threshold: 1.5,
      })).rejects.toThrow(/Threshold must be between/);
    });
  });

  describe('--feedback', () => {
    it('writes feedback.json when flag is set', async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-cmd-'));
      const skillDir = path.join(tmpDir, 'test-skill');
      fs.mkdirSync(path.join(skillDir, 'evals'), { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'evals', 'evals.json'), JSON.stringify({
        skill_name: 'test',
        evals: [{ id: 1, prompt: 'test', expected_output: 'test', slug: 'test-eval' }],
      }));
      const results = await evalCommand(skillDir, mockHarness, mockInference, {
        workspace: path.join(tmpDir, 'ws'), feedback: true,
      });
      const feedbackPath = path.join(results.iterationDir, 'feedback.json');
      expect(fs.existsSync(feedbackPath)).toBe(true);
      const feedback = JSON.parse(fs.readFileSync(feedbackPath, 'utf-8'));
      expect(feedback['eval-test-eval']).toBe('');
    });

    it('does not write feedback.json when flag is not set', async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-cmd-'));
      const skillDir = path.join(tmpDir, 'test-skill');
      fs.mkdirSync(path.join(skillDir, 'evals'), { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'evals', 'evals.json'), JSON.stringify({
        skill_name: 'test',
        evals: [{ id: 1, prompt: 'test', expected_output: 'test' }],
      }));
      const results = await evalCommand(skillDir, mockHarness, mockInference, {
        workspace: path.join(tmpDir, 'ws'),
      });
      const feedbackPath = path.join(results.iterationDir, 'feedback.json');
      expect(fs.existsSync(feedbackPath)).toBe(false);
    });
  });
});
