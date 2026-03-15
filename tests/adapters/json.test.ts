import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { JSONReporter } from '../../src/adapters/report/json.js';
import type { EvalResults, ScenarioResult } from '../../src/types.js';

function makeScenario(
  id: number,
  verdict: 'pass' | 'regressed' | 'inconclusive',
  assertionPassed: boolean[] = []
): ScenarioResult {
  return {
    scenarioId: id,
    prompt: `prompt ${id}`,
    comparison: {
      scenarioId: id,
      verdict,
      tier: 1,
      details: '',
    },
    timing: {
      total_tokens: 50,
      duration_ms: 200,
    },
    newOutput: {
      raw: 'output',
      metadata: {
        tokens: 50,
        durationMs: 200,
        model: 'copilot',
        adapter: 'copilot-cli',
      },
    },
    baselineOutput: {
      raw: 'baseline output',
      metadata: {
        tokens: 50,
        durationMs: 200,
        model: 'copilot',
        adapter: 'copilot-cli',
      },
    },
    grading: assertionPassed.length > 0
      ? {
          assertion_results: assertionPassed.map((passed, i) => ({
            text: `assertion ${i}`,
            passed,
            evidence: passed ? 'found' : 'not found',
          })),
          summary: {
            passed: assertionPassed.filter(Boolean).length,
            failed: assertionPassed.filter((x) => !x).length,
            total: assertionPassed.length,
            pass_rate: assertionPassed.filter(Boolean).length / assertionPassed.length,
          },
        }
      : undefined,
  };
}

function makeResults(scenarios: ScenarioResult[]): EvalResults {
  const passed = scenarios.filter((s) => s.comparison.verdict === 'pass').length;
  const regressed = scenarios.filter((s) => s.comparison.verdict === 'regressed').length;
  return {
    skillName: 'test-skill',
    scenarios,
    summary: {
      total_scenarios: scenarios.length,
      passed,
      regressed,
      pass_rate: scenarios.length > 0 ? passed / scenarios.length : 0,
      total_tokens: 150,
      total_cost_usd: 0,
      total_duration_ms: 600,
      tier_breakdown: {
        tier1_schema: 1,
        tier2_llm_judge: 1,
      },
    },
    timing: {
      total_tokens: 150,
      duration_ms: 600,
    },
  };
}

describe('JSONReporter', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapeval-json-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('file creation', () => {
    it('creates grading.json', async () => {
      const reporter = new JSONReporter(tmpDir);
      await reporter.report(makeResults([makeScenario(1, 'pass')]));
      expect(fs.existsSync(path.join(tmpDir, 'grading.json'))).toBe(true);
    });

    it('creates timing.json', async () => {
      const reporter = new JSONReporter(tmpDir);
      await reporter.report(makeResults([makeScenario(1, 'pass')]));
      expect(fs.existsSync(path.join(tmpDir, 'timing.json'))).toBe(true);
    });

    it('creates benchmark.json', async () => {
      const reporter = new JSONReporter(tmpDir);
      await reporter.report(makeResults([makeScenario(1, 'pass')]));
      expect(fs.existsSync(path.join(tmpDir, 'benchmark.json'))).toBe(true);
    });

    it('creates outputDir if it does not exist', async () => {
      const nestedDir = path.join(tmpDir, 'nested', 'deep', 'dir');
      const reporter = new JSONReporter(nestedDir);
      await reporter.report(makeResults([makeScenario(1, 'pass')]));
      expect(fs.existsSync(path.join(nestedDir, 'grading.json'))).toBe(true);
    });
  });

  describe('grading.json', () => {
    it('contains assertion_results from all scenarios', async () => {
      const scenarios = [
        makeScenario(1, 'pass', [true, false]),
        makeScenario(2, 'regressed', [false]),
      ];
      const reporter = new JSONReporter(tmpDir);
      await reporter.report(makeResults(scenarios));

      const grading = JSON.parse(fs.readFileSync(path.join(tmpDir, 'grading.json'), 'utf-8'));
      expect(grading.assertion_results).toHaveLength(3);
    });

    it('computes correct summary counts', async () => {
      const scenarios = [
        makeScenario(1, 'pass', [true, true]),
        makeScenario(2, 'regressed', [false]),
      ];
      const reporter = new JSONReporter(tmpDir);
      await reporter.report(makeResults(scenarios));

      const grading = JSON.parse(fs.readFileSync(path.join(tmpDir, 'grading.json'), 'utf-8'));
      expect(grading.summary.passed).toBe(2);
      expect(grading.summary.failed).toBe(1);
      expect(grading.summary.total).toBe(3);
      expect(grading.summary.pass_rate).toBeCloseTo(2 / 3, 5);
    });

    it('handles scenarios with no grading data', async () => {
      const reporter = new JSONReporter(tmpDir);
      await reporter.report(makeResults([makeScenario(1, 'pass')]));

      const grading = JSON.parse(fs.readFileSync(path.join(tmpDir, 'grading.json'), 'utf-8'));
      expect(grading.assertion_results).toHaveLength(0);
      expect(grading.summary.total).toBe(0);
      expect(grading.summary.pass_rate).toBe(0);
    });

    it('has valid JSON format', async () => {
      const reporter = new JSONReporter(tmpDir);
      await reporter.report(makeResults([makeScenario(1, 'pass', [true])]));

      const raw = fs.readFileSync(path.join(tmpDir, 'grading.json'), 'utf-8');
      expect(() => JSON.parse(raw)).not.toThrow();
    });
  });

  describe('timing.json', () => {
    it('contains total_tokens and duration_ms', async () => {
      const reporter = new JSONReporter(tmpDir);
      await reporter.report(makeResults([makeScenario(1, 'pass')]));

      const timing = JSON.parse(fs.readFileSync(path.join(tmpDir, 'timing.json'), 'utf-8'));
      expect(timing.total_tokens).toBe(150);
      expect(timing.duration_ms).toBe(600);
    });

    it('has valid JSON format', async () => {
      const reporter = new JSONReporter(tmpDir);
      await reporter.report(makeResults([makeScenario(1, 'pass')]));

      const raw = fs.readFileSync(path.join(tmpDir, 'timing.json'), 'utf-8');
      expect(() => JSON.parse(raw)).not.toThrow();
    });
  });

  describe('benchmark.json', () => {
    it('contains run_summary with results.summary', async () => {
      const results = makeResults([makeScenario(1, 'pass'), makeScenario(2, 'regressed')]);
      const reporter = new JSONReporter(tmpDir);
      await reporter.report(results);

      const benchmark = JSON.parse(fs.readFileSync(path.join(tmpDir, 'benchmark.json'), 'utf-8'));
      expect(benchmark.run_summary).toBeDefined();
      expect(benchmark.run_summary.total_scenarios).toBe(2);
      expect(benchmark.run_summary.passed).toBe(1);
      expect(benchmark.run_summary.regressed).toBe(1);
    });

    it('has valid JSON format', async () => {
      const reporter = new JSONReporter(tmpDir);
      await reporter.report(makeResults([makeScenario(1, 'pass')]));

      const raw = fs.readFileSync(path.join(tmpDir, 'benchmark.json'), 'utf-8');
      expect(() => JSON.parse(raw)).not.toThrow();
    });
  });

  describe('name', () => {
    it('is "json"', () => {
      const reporter = new JSONReporter('/some/path');
      expect(reporter.name).toBe('json');
    });
  });
});
