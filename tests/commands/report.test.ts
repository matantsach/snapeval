import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { reportCommand } from '../../src/commands/report.js';
import type { EvalResults, ScenarioResult, SkillOutput } from '../../src/types.js';

function makeOutput(raw: string): SkillOutput {
  return { raw, metadata: { tokens: 50, durationMs: 200, model: 'copilot', adapter: 'copilot-cli' } };
}

function makeResults(): EvalResults {
  const scenario: ScenarioResult = {
    scenarioId: 1,
    prompt: 'test prompt',
    comparison: { scenarioId: 1, verdict: 'pass', tier: 1, details: 'Schema match' },
    timing: { total_tokens: 50, duration_ms: 200 },
    newOutput: makeOutput('current'),
    baselineOutput: makeOutput('baseline'),
  };
  return {
    skillName: 'test-skill',
    scenarios: [scenario],
    summary: {
      total_scenarios: 1, passed: 1, regressed: 0, pass_rate: 1,
      total_tokens: 50, total_cost_usd: 0, total_duration_ms: 200,
      tier_breakdown: { tier1_schema: 1, tier2_embedding: 0, tier3_llm_judge: 0 },
    },
    timing: { total_tokens: 50, duration_ms: 200 },
  };
}

describe('reportCommand', () => {
  let tmpDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapeval-report-test-'));
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    consoleSpy.mockRestore();
  });

  it('creates iteration-1 directory with JSON files', async () => {
    await reportCommand(tmpDir, makeResults(), { verbose: false });
    const iterDir = path.join(tmpDir, 'evals', 'results', 'iteration-1');
    expect(fs.existsSync(path.join(iterDir, 'grading.json'))).toBe(true);
    expect(fs.existsSync(path.join(iterDir, 'benchmark.json'))).toBe(true);
    expect(fs.existsSync(path.join(iterDir, 'timing.json'))).toBe(true);
  });

  it('does not create HTML files when --html is not set', async () => {
    await reportCommand(tmpDir, makeResults(), { verbose: false });
    const iterDir = path.join(tmpDir, 'evals', 'results', 'iteration-1');
    expect(fs.existsSync(path.join(iterDir, 'report.html'))).toBe(false);
  });

  it('creates HTML files when --html is set', async () => {
    await reportCommand(tmpDir, makeResults(), { verbose: false, html: true });
    const iterDir = path.join(tmpDir, 'evals', 'results', 'iteration-1');
    expect(fs.existsSync(path.join(iterDir, 'report.html'))).toBe(true);
    expect(fs.existsSync(path.join(iterDir, 'viewer-data.json'))).toBe(true);
  });

  it('returns the iteration directory path', async () => {
    const result = await reportCommand(tmpDir, makeResults(), { verbose: false });
    expect(result).toContain('iteration-1');
  });

  it('increments iteration number on subsequent calls', async () => {
    await reportCommand(tmpDir, makeResults(), { verbose: false });
    const result = await reportCommand(tmpDir, makeResults(), { verbose: false });
    expect(result).toContain('iteration-2');
  });
});
