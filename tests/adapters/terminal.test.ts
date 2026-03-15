import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TerminalReporter } from '../../src/adapters/report/terminal.js';
import type { EvalResults, ScenarioResult } from '../../src/types.js';

function makeScenario(
  id: number,
  verdict: 'pass' | 'regressed' | 'inconclusive',
  tier: 1 | 2 = 1
): ScenarioResult {
  return {
    scenarioId: id,
    prompt: `test prompt ${id}`,
    comparison: {
      scenarioId: id,
      verdict,
      tier,
      details: `verdict: ${verdict}`,
    },
    timing: {
      total_tokens: 100,
      duration_ms: 1500,
    },
    newOutput: {
      raw: 'output text',
      metadata: {
        tokens: 100,
        durationMs: 1500,
        model: 'copilot',
        adapter: 'copilot-cli',
      },
    },
    baselineOutput: {
      raw: 'baseline output',
      metadata: {
        tokens: 100,
        durationMs: 1500,
        model: 'copilot',
        adapter: 'copilot-cli',
      },
    },
  };
}

function makeResults(scenarios: ScenarioResult[]): EvalResults {
  const passed = scenarios.filter((s) => s.comparison.verdict === 'pass').length;
  const regressed = scenarios.filter((s) => s.comparison.verdict === 'regressed').length;
  return {
    skillName: 'my-skill',
    scenarios,
    summary: {
      total_scenarios: scenarios.length,
      passed,
      regressed,
      pass_rate: scenarios.length > 0 ? passed / scenarios.length : 0,
      total_tokens: 300,
      total_cost_usd: 0,
      total_duration_ms: 4500,
      tier_breakdown: {
        tier1_schema: 1,
        tier2_llm_judge: 1,
      },
    },
    timing: {
      total_tokens: 300,
      duration_ms: 4500,
    },
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
    await reporter.report(makeResults([makeScenario(1, 'pass')]));
    const output = logLines.join('\n');
    expect(output).toContain('my-skill');
  });

  it('prints scenario IDs', async () => {
    const reporter = new TerminalReporter();
    await reporter.report(makeResults([makeScenario(1, 'pass'), makeScenario(2, 'regressed')]));
    const output = logLines.join('\n');
    expect(output).toContain('Scenario 1');
    expect(output).toContain('Scenario 2');
  });

  it('prints tier information', async () => {
    const reporter = new TerminalReporter();
    await reporter.report(makeResults([makeScenario(1, 'pass', 2)]));
    const output = logLines.join('\n');
    expect(output).toContain('tier2');
  });

  it('prints pass count', async () => {
    const reporter = new TerminalReporter();
    await reporter.report(makeResults([makeScenario(1, 'pass'), makeScenario(2, 'pass'), makeScenario(3, 'regressed')]));
    const output = logLines.join('\n');
    expect(output).toContain('2 passed');
  });

  it('prints regressed count', async () => {
    const reporter = new TerminalReporter();
    await reporter.report(makeResults([makeScenario(1, 'pass'), makeScenario(2, 'regressed')]));
    const output = logLines.join('\n');
    expect(output).toContain('1 regressed');
  });

  it('prints total scenarios count', async () => {
    const reporter = new TerminalReporter();
    await reporter.report(makeResults([makeScenario(1, 'pass'), makeScenario(2, 'pass'), makeScenario(3, 'inconclusive')]));
    const output = logLines.join('\n');
    expect(output).toContain('3 total');
  });

  it('prints token count', async () => {
    const reporter = new TerminalReporter();
    await reporter.report(makeResults([makeScenario(1, 'pass')]));
    const output = logLines.join('\n');
    expect(output).toContain('300');
  });

  it('prints duration in seconds', async () => {
    const reporter = new TerminalReporter();
    await reporter.report(makeResults([makeScenario(1, 'pass')]));
    const output = logLines.join('\n');
    // 4500ms => 4.50s
    expect(output).toContain('4.50');
  });

  it('prints cost', async () => {
    const reporter = new TerminalReporter();
    await reporter.report(makeResults([makeScenario(1, 'pass')]));
    const output = logLines.join('\n');
    expect(output).toContain('$0.0000');
  });

  it('prints tier breakdown', async () => {
    const reporter = new TerminalReporter();
    await reporter.report(makeResults([makeScenario(1, 'pass')]));
    const output = logLines.join('\n');
    expect(output).toContain('schema');
    expect(output).toContain('llm judge');
  });

  it('name is "terminal"', () => {
    const reporter = new TerminalReporter();
    expect(reporter.name).toBe('terminal');
  });
});
