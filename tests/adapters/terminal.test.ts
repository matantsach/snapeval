import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TerminalReporter } from '../../src/adapters/report/terminal.js';
import type { EvalResults, EvalRunResult, BenchmarkData } from '../../src/types.js';

function makeEvalRun(
  id: number,
  passRate?: number,
): EvalRunResult {
  return {
    evalId: id,
    slug: `eval-${id}`,
    prompt: `test prompt ${id}`,
    withSkill: {
      output: { raw: 'with skill output', files: [], total_tokens: 100, duration_ms: 1500 },
      grading: passRate !== undefined ? {
        assertion_results: [{ text: 'assertion', passed: passRate > 0.5, evidence: 'evidence' }],
        summary: { passed: passRate > 0.5 ? 1 : 0, failed: passRate > 0.5 ? 0 : 1, total: 1, pass_rate: passRate },
      } : undefined,
    },
    withoutSkill: {
      output: { raw: 'without skill output', files: [], total_tokens: 80, duration_ms: 1000 },
      grading: passRate !== undefined ? {
        assertion_results: [{ text: 'assertion', passed: false, evidence: 'evidence' }],
        summary: { passed: 0, failed: 1, total: 1, pass_rate: 0 },
      } : undefined,
    },
  };
}

function makeResults(runs: EvalRunResult[]): EvalResults {
  const benchmark: BenchmarkData = {
    run_summary: {
      with_skill: { pass_rate: { mean: 0.75, stddev: 0 }, time_seconds: { mean: 1.5, stddev: 0 }, tokens: { mean: 100, stddev: 0 } },
      without_skill: { pass_rate: { mean: 0.25, stddev: 0 }, time_seconds: { mean: 1.0, stddev: 0 }, tokens: { mean: 80, stddev: 0 } },
      delta: { pass_rate: 0.5, time_seconds: 0.5, tokens: 20 },
    },
  };
  return {
    skillName: 'my-skill',
    evalRuns: runs,
    benchmark,
    iterationDir: '/tmp/test/iteration-1',
  };
}

describe('TerminalReporter', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  const logLines: string[] = [];

  beforeEach(() => {
    logLines.length = 0;
    consoleSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logLines.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('prints the skill name', async () => {
    const reporter = new TerminalReporter();
    await reporter.report(makeResults([makeEvalRun(1, 1.0)]));
    const output = logLines.join('\n');
    expect(output).toContain('my-skill');
  });

  it('prints eval IDs', async () => {
    const reporter = new TerminalReporter();
    await reporter.report(makeResults([makeEvalRun(1, 1.0), makeEvalRun(2, 0.5)]));
    const output = logLines.join('\n');
    expect(output).toContain('#1');
    expect(output).toContain('#2');
  });

  it('prints Skill and Baseline labels', async () => {
    const reporter = new TerminalReporter();
    await reporter.report(makeResults([makeEvalRun(1, 0.75)]));
    const output = logLines.join('\n');
    expect(output).toContain('Skill:');
    expect(output).toContain('Baseline:');
  });

  it('prints improvement percentage', async () => {
    const reporter = new TerminalReporter();
    await reporter.report(makeResults([makeEvalRun(1, 1.0)]));
    const output = logLines.join('\n');
    expect(output).toContain('+50.0%');
  });

  it('prints n/a when no grading available', async () => {
    const reporter = new TerminalReporter();
    await reporter.report(makeResults([makeEvalRun(1)]));
    const output = logLines.join('\n');
    expect(output).toContain('n/a');
  });

  it('prints token count', async () => {
    const reporter = new TerminalReporter();
    await reporter.report(makeResults([makeEvalRun(1, 1.0)]));
    const output = logLines.join('\n');
    expect(output).toContain('100');
  });

  it('prints duration in seconds', async () => {
    const reporter = new TerminalReporter();
    await reporter.report(makeResults([makeEvalRun(1, 1.0)]));
    const output = logLines.join('\n');
    // 1500ms => 1.5s
    expect(output).toContain('1.5s');
  });

  it('name is "terminal"', () => {
    const reporter = new TerminalReporter();
    expect(reporter.name).toBe('terminal');
  });
});
