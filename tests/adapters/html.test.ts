import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { HTMLReporter } from '../../src/adapters/report/html.js';
import type { EvalResults, ScenarioResult, SkillOutput } from '../../src/types.js';

function makeOutput(raw: string): SkillOutput {
  return {
    raw,
    metadata: { tokens: 50, durationMs: 200, model: 'copilot', adapter: 'copilot-cli' },
  };
}

function makeScenario(
  id: number,
  verdict: 'pass' | 'regressed' | 'inconclusive',
  tier: 1 | 2 | 3 = 1
): ScenarioResult {
  return {
    scenarioId: id,
    prompt: `test prompt ${id}`,
    comparison: {
      scenarioId: id,
      verdict,
      tier,
      details: `verdict: ${verdict}`,
      ...(tier === 3 ? { judgeReasoning: { forward: '{"verdict":"consistent"}', reverse: '{"verdict":"consistent"}' } } : {}),
      ...(tier === 2 ? { similarity: 0.92 } : {}),
    },
    timing: { total_tokens: 50, duration_ms: 200 },
    newOutput: makeOutput(`current output ${id}`),
    baselineOutput: makeOutput(`baseline output ${id}`),
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
      tier_breakdown: { tier1_schema: 1, tier2_embedding: 1, tier3_llm_judge: 1 },
    },
    timing: { total_tokens: 150, duration_ms: 600 },
  };
}

describe('HTMLReporter', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapeval-html-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('name is "html"', () => {
    const reporter = new HTMLReporter(tmpDir, 1);
    expect(reporter.name).toBe('html');
  });

  it('creates report.html', async () => {
    const reporter = new HTMLReporter(tmpDir, 1);
    await reporter.report(makeResults([makeScenario(1, 'pass')]));
    expect(fs.existsSync(path.join(tmpDir, 'report.html'))).toBe(true);
  });

  it('creates viewer-data.json', async () => {
    const reporter = new HTMLReporter(tmpDir, 1);
    await reporter.report(makeResults([makeScenario(1, 'pass')]));
    expect(fs.existsSync(path.join(tmpDir, 'viewer-data.json'))).toBe(true);
  });

  it('creates output directory if it does not exist', async () => {
    const nestedDir = path.join(tmpDir, 'nested', 'deep');
    const reporter = new HTMLReporter(nestedDir, 1);
    await reporter.report(makeResults([makeScenario(1, 'pass')]));
    expect(fs.existsSync(path.join(nestedDir, 'report.html'))).toBe(true);
  });

  it('embeds scenario data in HTML', async () => {
    const reporter = new HTMLReporter(tmpDir, 1);
    await reporter.report(makeResults([makeScenario(1, 'pass'), makeScenario(2, 'regressed')]));
    const html = fs.readFileSync(path.join(tmpDir, 'report.html'), 'utf-8');
    expect(html).toContain('test-skill');
    expect(html).toContain('baseline output 1');
    expect(html).toContain('current output 1');
    expect(html).toContain('test prompt 1');
  });

  it('viewer-data.json has correct structure', async () => {
    const reporter = new HTMLReporter(tmpDir, 1);
    await reporter.report(makeResults([makeScenario(1, 'pass', 2), makeScenario(2, 'regressed', 3)]));
    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, 'viewer-data.json'), 'utf-8'));
    expect(data.skillName).toBe('test-skill');
    expect(data.iteration).toBe(1);
    expect(data.scenarios).toHaveLength(2);
    expect(data.scenarios[0].baselineOutput).toBe('baseline output 1');
    expect(data.scenarios[0].currentOutput).toBe('current output 1');
    expect(data.scenarios[0].verdict).toBe('pass');
    expect(data.scenarios[0].tier).toBe(2);
    expect(data.scenarios[0].similarity).toBe(0.92);
    expect(data.scenarios[1].judgeReasoning).toBeDefined();
  });

  it('HTML is a complete self-contained document', async () => {
    const reporter = new HTMLReporter(tmpDir, 1);
    await reporter.report(makeResults([makeScenario(1, 'pass')]));
    const html = fs.readFileSync(path.join(tmpDir, 'report.html'), 'utf-8');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
    expect(html).toContain('<style>');
    expect(html).toContain('<script>');
  });

  it('includes benchmark summary in HTML', async () => {
    const reporter = new HTMLReporter(tmpDir, 1);
    await reporter.report(makeResults([makeScenario(1, 'pass'), makeScenario(2, 'regressed')]));
    const html = fs.readFileSync(path.join(tmpDir, 'report.html'), 'utf-8');
    expect(html).toContain('tier1_schema');
  });

  it('loads previous iteration data when available', async () => {
    // Write iteration 1 data
    const prevDir = path.join(tmpDir, '..', 'iteration-1');
    fs.mkdirSync(prevDir, { recursive: true });
    const prevData = {
      skillName: 'test-skill',
      generatedAt: '2026-03-14T00:00:00Z',
      iteration: 1,
      scenarios: [{ scenarioId: 1, prompt: 'p', baselineOutput: 'old baseline', currentOutput: 'old current', verdict: 'pass', tier: 1, details: '', timing: { total_tokens: 0, duration_ms: 0 } }],
      summary: { total_scenarios: 1, passed: 1, regressed: 0, pass_rate: 1, total_tokens: 0, total_cost_usd: 0, total_duration_ms: 0, tier_breakdown: { tier1_schema: 1, tier2_embedding: 0, tier3_llm_judge: 0 } },
    };
    fs.writeFileSync(path.join(prevDir, 'viewer-data.json'), JSON.stringify(prevData), 'utf-8');

    // Write iteration 2 — the reporter for iteration 2 should find iteration 1
    const iter2Dir = path.join(tmpDir, '..', 'iteration-2');
    fs.mkdirSync(iter2Dir, { recursive: true });
    const reporter = new HTMLReporter(iter2Dir, 2);
    await reporter.report(makeResults([makeScenario(1, 'regressed', 3)]));

    const data = JSON.parse(fs.readFileSync(path.join(iter2Dir, 'viewer-data.json'), 'utf-8'));
    expect(data.previousIteration).toBeDefined();
    expect(data.previousIteration.summary.passed).toBe(1);
  });

  it('handles missing previous iteration gracefully', async () => {
    const reporter = new HTMLReporter(tmpDir, 5);
    await reporter.report(makeResults([makeScenario(1, 'pass')]));
    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, 'viewer-data.json'), 'utf-8'));
    expect(data.previousIteration).toBeUndefined();
  });

  it('escapes closing script tags in embedded JSON data', async () => {
    const scenario = makeScenario(1, 'pass');
    scenario.prompt = 'payload</script><script>alert(1)</script>';
    const results = makeResults([scenario]);
    results.skillName = 'test</script>';
    const reporter = new HTMLReporter(tmpDir, 1);
    await reporter.report(results);
    const html = fs.readFileSync(path.join(tmpDir, 'report.html'), 'utf-8');
    // </script> in data must be escaped to prevent script breakout
    const scriptBlocks = html.split(/<script>/gi);
    // Should have exactly 2 script blocks: one from <head> (none) and the main one
    // The closing </script> should only appear as the legitimate end of our script block
    expect(html).not.toContain('</script><script>alert');
  });

  it('escapes skill name in title tag', async () => {
    const results = makeResults([makeScenario(1, 'pass')]);
    results.skillName = '<img onerror=alert(1)>';
    const reporter = new HTMLReporter(tmpDir, 1);
    await reporter.report(results);
    const html = fs.readFileSync(path.join(tmpDir, 'report.html'), 'utf-8');
    // Title should have HTML-escaped skill name
    expect(html).toContain('&lt;img onerror=alert(1)&gt;');
  });
});
