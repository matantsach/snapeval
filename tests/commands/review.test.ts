import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

vi.mock('../../src/commands/eval.js', () => ({
  evalCommand: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { reviewCommand } from '../../src/commands/review.js';
import { evalCommand } from '../../src/commands/eval.js';
import type { Harness, InferenceAdapter, EvalResults, BenchmarkData } from '../../src/types.js';

describe('reviewCommand', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('calls eval, creates feedback template', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-'));
    const iterDir = path.join(tmpDir, 'iteration-1');
    fs.mkdirSync(iterDir, { recursive: true });

    const mockBenchmark: BenchmarkData = {
      run_summary: {
        with_skill: { pass_rate: { mean: 0.75, stddev: 0 }, time_seconds: { mean: 5, stddev: 0 }, tokens: { mean: 500, stddev: 0 } },
        without_skill: { pass_rate: { mean: 0.25, stddev: 0 }, time_seconds: { mean: 3, stddev: 0 }, tokens: { mean: 300, stddev: 0 } },
        delta: { pass_rate: 0.5, time_seconds: 2, tokens: 200 },
      },
    };

    const mockResults: EvalResults = {
      skillName: 'test',
      evalRuns: [{
        evalId: 1, slug: 'test-eval', prompt: 'test',
        withSkill: { output: { raw: 'with', files: [], total_tokens: 500, duration_ms: 5000 } },
        withoutSkill: { output: { raw: 'without', files: [], total_tokens: 300, duration_ms: 3000 } },
      }],
      benchmark: mockBenchmark,
      iterationDir: iterDir,
    };

    vi.mocked(evalCommand).mockResolvedValue(mockResults);

    const mockHarness: Harness = { name: 'mock', run: vi.fn(), isAvailable: vi.fn() };
    const mockInference: InferenceAdapter = { name: 'mock', chat: vi.fn() };

    await reviewCommand('/skill', mockHarness, mockInference, {
      workspace: tmpDir, runs: 1, noOpen: true,
    });

    const feedback = JSON.parse(fs.readFileSync(path.join(iterDir, 'feedback.json'), 'utf-8'));
    expect(feedback['eval-test-eval']).toBe('');
  });
});
