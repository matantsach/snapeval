import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkCommand } from '../../src/commands/check.js';
import { SnapshotManager } from '../../src/engine/snapshot.js';
import type { SkillAdapter, InferenceAdapter, EvalsFile, SkillOutput } from '../../src/types.js';

// --- Helpers ---

function makeOutput(raw: string, tokens = 10): SkillOutput {
  return {
    raw,
    metadata: { tokens, durationMs: 50, model: 'gpt-4o', adapter: 'mock' },
  };
}

function makeSkillAdapter(outputRaw = 'mock output'): SkillAdapter {
  return {
    name: 'mock-skill',
    invoke: vi.fn().mockResolvedValue(makeOutput(outputRaw)),
    isAvailable: vi.fn().mockResolvedValue(true),
  };
}

function makeInference(): InferenceAdapter {
  return {
    name: 'mock-inference',
    // LLM judge expects {"verdict": "consistent"} or {"verdict": "different"}
    chat: vi.fn().mockResolvedValue(JSON.stringify({ verdict: 'consistent' })),
    embed: vi.fn().mockResolvedValue(new Array(10).fill(0.1)),
    estimateCost: vi.fn().mockReturnValue(0),
  };
}

const SAMPLE_EVALS: EvalsFile = {
  skill_name: 'test-skill',
  generated_by: 'snapeval v1.0.0',
  evals: [
    { id: 1, prompt: 'Hello world', expected_output: 'Greeting', assertions: [] },
    { id: 2, prompt: 'Goodbye', expected_output: 'Farewell', assertions: [] },
  ],
};

describe('checkCommand', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapeval-check-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeEvals(evals: EvalsFile = SAMPLE_EVALS): void {
    fs.mkdirSync(path.join(tmpDir, 'evals'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'evals', 'evals.json'),
      JSON.stringify(evals),
      'utf-8'
    );
  }

  function writeBaselines(outputs: Record<number, string> = { 1: 'baseline 1', 2: 'baseline 2' }): void {
    const manager = new SnapshotManager(path.join(tmpDir, 'evals'));
    for (const [id, raw] of Object.entries(outputs)) {
      const evalCase = SAMPLE_EVALS.evals.find((e) => e.id === Number(id))!;
      manager.saveSnapshot(Number(id), evalCase.prompt, makeOutput(raw));
    }
  }

  it('returns EvalResults with correct structure', async () => {
    writeEvals();
    writeBaselines();

    const results = await checkCommand(
      tmpDir,
      makeSkillAdapter('baseline 1'),
      makeInference(),
      { threshold: 0.85, budget: 'unlimited' }
    );

    expect(results.skillName).toBe('test-skill');
    expect(results.scenarios).toHaveLength(2);
    expect(results.summary.total_scenarios).toBe(2);
    expect(results.timing).toHaveProperty('total_tokens');
    expect(results.timing).toHaveProperty('duration_ms');
  });

  it('throws SnapevalError when evals.json is missing', async () => {
    await expect(
      checkCommand(tmpDir, makeSkillAdapter(), makeInference(), {
        threshold: 0.85,
        budget: 'unlimited',
      })
    ).rejects.toThrow('No evals.json found');
  });

  it('throws NoBaselineError when no snapshots exist', async () => {
    writeEvals();
    // No baselines written

    await expect(
      checkCommand(tmpDir, makeSkillAdapter(), makeInference(), {
        threshold: 0.85,
        budget: 'unlimited',
      })
    ).rejects.toThrow('No baselines found');
  });

  it('skips scenarios without a baseline snapshot', async () => {
    writeEvals();
    // Only write baseline for scenario 1
    const manager = new SnapshotManager(path.join(tmpDir, 'evals'));
    manager.saveSnapshot(1, 'Hello world', makeOutput('baseline'));

    const results = await checkCommand(
      tmpDir,
      makeSkillAdapter('baseline'),
      makeInference(),
      { threshold: 0.85, budget: 'unlimited' }
    );

    // Only scenario 1 has a baseline; scenario 2 is skipped
    expect(results.scenarios).toHaveLength(1);
    expect(results.scenarios[0].scenarioId).toBe(1);
  });

  it('sets scenarioId on each comparison result', async () => {
    writeEvals();
    writeBaselines();

    const results = await checkCommand(
      tmpDir,
      makeSkillAdapter('baseline 1'),
      makeInference(),
      { threshold: 0.85, budget: 'unlimited' }
    );

    for (const scenario of results.scenarios) {
      expect(scenario.comparison.scenarioId).toBe(scenario.scenarioId);
    }
  });

  it('calculates pass_rate correctly for all-pass results', async () => {
    writeEvals();
    // Use same output as baseline so schema-check tier 1 passes
    writeBaselines({ 1: 'same output', 2: 'same output' });

    const results = await checkCommand(
      tmpDir,
      makeSkillAdapter('same output'),
      makeInference(),
      { threshold: 0.85, budget: 'unlimited' }
    );

    expect(results.summary.passed).toBe(2);
    expect(results.summary.regressed).toBe(0);
    expect(results.summary.pass_rate).toBe(1.0);
  });

  it('counts regressions correctly', async () => {
    writeEvals();
    // Baselines have structured content (lists), new output is plain text — schema differs
    writeBaselines({
      1: '- item one\n- item two\n- item three',
      2: '- step one\n- step two',
    });

    // LLM judge expects {"verdict": "different"} or {"verdict": "consistent"}
    const inference = makeInference();
    (inference.chat as ReturnType<typeof vi.fn>).mockResolvedValue(
      JSON.stringify({ verdict: 'different' })
    );

    // New output is plain prose — structurally different from baseline lists
    const results = await checkCommand(
      tmpDir,
      makeSkillAdapter('This is plain prose output without any list structure at all.'),
      inference,
      { threshold: 0.85, budget: 'unlimited', skipEmbedding: true }
    );

    expect(results.summary.regressed).toBeGreaterThan(0);
  });

  it('accumulates token counts in summary', async () => {
    writeEvals();
    writeBaselines();

    const skillAdapter = makeSkillAdapter('output');
    (skillAdapter.invoke as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeOutput('output', 100)
    );

    const results = await checkCommand(
      tmpDir,
      skillAdapter,
      makeInference(),
      { threshold: 0.85, budget: 'unlimited' }
    );

    // 2 scenarios x 100 tokens each = 200
    expect(results.summary.total_tokens).toBe(200);
  });

  it('includes baselineOutput in each scenario result', async () => {
    writeEvals();
    writeBaselines({ 1: 'baseline text 1', 2: 'baseline text 2' });

    const results = await checkCommand(
      tmpDir,
      makeSkillAdapter('new output'),
      makeInference(),
      { threshold: 0.85, budget: 'unlimited' }
    );

    for (const scenario of results.scenarios) {
      expect(scenario.baselineOutput).toBeDefined();
      expect(scenario.baselineOutput.raw).toBeTruthy();
    }
    expect(results.scenarios[0].baselineOutput.raw).toBe('baseline text 1');
  });

  it('handles single-scenario evals file', async () => {
    const singleEval: EvalsFile = {
      skill_name: 'single-skill',
      generated_by: 'snapeval v1.0.0',
      evals: [{ id: 1, prompt: 'only prompt', expected_output: 'ok', assertions: [] }],
    };
    writeEvals(singleEval);

    const manager = new SnapshotManager(path.join(tmpDir, 'evals'));
    manager.saveSnapshot(1, 'only prompt', makeOutput('result'));

    const results = await checkCommand(
      tmpDir,
      makeSkillAdapter('result'),
      makeInference(),
      { threshold: 0.85, budget: 'unlimited' }
    );

    expect(results.skillName).toBe('single-skill');
    expect(results.scenarios).toHaveLength(1);
    expect(results.summary.total_scenarios).toBe(1);
  });
});
