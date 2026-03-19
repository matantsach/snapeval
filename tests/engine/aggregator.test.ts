import { describe, it, expect } from 'vitest';
import { computeBenchmark } from '../../src/engine/aggregator.js';
import type { EvalRunResult } from '../../src/types.js';

describe('computeBenchmark', () => {
  it('computes correct delta between with_skill and without_skill', () => {
    const runs: EvalRunResult[] = [
      {
        evalId: 1, slug: 'test-1', prompt: 'test',
        withSkill: {
          output: { raw: '', files: [], total_tokens: 4000, duration_ms: 50000 },
          grading: { assertion_results: [], summary: { passed: 3, failed: 1, total: 4, pass_rate: 0.75 } },
        },
        withoutSkill: {
          output: { raw: '', files: [], total_tokens: 2000, duration_ms: 30000 },
          grading: { assertion_results: [], summary: { passed: 1, failed: 3, total: 4, pass_rate: 0.25 } },
        },
      },
      {
        evalId: 2, slug: 'test-2', prompt: 'test 2',
        withSkill: {
          output: { raw: '', files: [], total_tokens: 3600, duration_ms: 40000 },
          grading: { assertion_results: [], summary: { passed: 4, failed: 0, total: 4, pass_rate: 1.0 } },
        },
        withoutSkill: {
          output: { raw: '', files: [], total_tokens: 2200, duration_ms: 34000 },
          grading: { assertion_results: [], summary: { passed: 2, failed: 2, total: 4, pass_rate: 0.5 } },
        },
      },
    ];

    const benchmark = computeBenchmark(runs);
    const ws = benchmark.run_summary.with_skill;
    const wos = benchmark.run_summary.without_skill;

    expect(ws.pass_rate.mean).toBeCloseTo(0.875);
    expect(wos.pass_rate.mean).toBeCloseTo(0.375);
    expect(benchmark.run_summary.delta.pass_rate).toBeCloseTo(0.5);
    expect(ws.tokens.mean).toBeCloseTo(3800);
    expect(wos.tokens.mean).toBeCloseTo(2100);
  });

  it('handles runs without grading (no assertions)', () => {
    const runs: EvalRunResult[] = [
      {
        evalId: 1, slug: 'test', prompt: 'test',
        withSkill: { output: { raw: '', files: [], total_tokens: 1000, duration_ms: 5000 } },
        withoutSkill: { output: { raw: '', files: [], total_tokens: 800, duration_ms: 3000 } },
      },
    ];

    const benchmark = computeBenchmark(runs);
    expect(benchmark.run_summary.with_skill.pass_rate.mean).toBe(0);
    expect(benchmark.run_summary.delta.tokens).toBeCloseTo(200);
  });
});
