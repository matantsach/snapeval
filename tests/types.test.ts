import { describe, it, expect } from 'vitest';
import type {
  HarnessRunResult,
  Harness,
  EvalCase,
  EvalsFile,
  TimingData,
  AssertionResult,
  GradingSummary,
  GradingResult,
  StatEntry,
  RunStats,
  BenchmarkData,
  FeedbackData,
  EvalRunResult,
  EvalResults,
  SnapevalConfig,
} from '../src/types.js';

describe('type definitions compile correctly', () => {
  it('HarnessRunResult has required fields', () => {
    const result: HarnessRunResult = {
      raw: 'output text',
      files: ['chart.png'],
      total_tokens: 500,
      duration_ms: 3000,
    };
    expect(result.raw).toBe('output text');
    expect(result.transcript).toBeUndefined();
  });

  it('EvalCase matches agentskills.io spec', () => {
    const evalCase: EvalCase = {
      id: 1,
      prompt: 'test prompt',
      expected_output: 'expected result',
    };
    expect(evalCase.files).toBeUndefined();
    expect(evalCase.assertions).toBeUndefined();
    expect(evalCase.slug).toBeUndefined();
  });

  it('EvalsFile has no generated_by field', () => {
    const file: EvalsFile = {
      skill_name: 'test',
      evals: [],
    };
    expect(file).not.toHaveProperty('generated_by');
  });

  it('GradingResult matches spec grading.json', () => {
    const grading: GradingResult = {
      assertion_results: [
        { text: 'Has chart', passed: true, evidence: 'Found chart.png' },
      ],
      summary: { passed: 1, failed: 0, total: 1, pass_rate: 1.0 },
    };
    expect(grading.summary.pass_rate).toBe(1.0);
  });

  it('BenchmarkData matches spec benchmark.json', () => {
    const benchmark: BenchmarkData = {
      run_summary: {
        with_skill: {
          pass_rate: { mean: 0.83, stddev: 0.06 },
          time_seconds: { mean: 45.0, stddev: 12.0 },
          tokens: { mean: 3800, stddev: 400 },
        },
        without_skill: {
          pass_rate: { mean: 0.33, stddev: 0.1 },
          time_seconds: { mean: 32.0, stddev: 8.0 },
          tokens: { mean: 2100, stddev: 300 },
        },
        delta: { pass_rate: 0.5, time_seconds: 13.0, tokens: 1700 },
      },
    };
    expect(benchmark.run_summary.delta.pass_rate).toBe(0.5);
  });

  it('SnapevalConfig has new shape', () => {
    const config: SnapevalConfig = {
      harness: 'copilot-cli',
      inference: 'auto',
      workspace: '../{skill_name}-workspace',
      runs: 1,
    };
    expect(config).not.toHaveProperty('adapter');
    expect(config).not.toHaveProperty('budget');
  });
});
