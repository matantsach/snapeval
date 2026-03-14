import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  SkillAdapter,
  InferenceAdapter,
  EvalsFile,
  EvalResults,
  ScenarioResult,
  BenchmarkSummary,
} from '../types.js';
import { SnapshotManager } from '../engine/snapshot.js';
import { comparePipeline } from '../engine/comparison/pipeline.js';
import { NoBaselineError, SnapevalError } from '../errors.js';
import { BudgetEngine } from '../engine/budget.js';

export async function checkCommand(
  skillPath: string,
  skillAdapter: SkillAdapter,
  inference: InferenceAdapter,
  options: { threshold: number; budget: string; skipEmbedding?: boolean }
): Promise<EvalResults> {
  const evalsPath = path.join(skillPath, 'evals', 'evals.json');
  if (!fs.existsSync(evalsPath)) {
    throw new SnapevalError(`No evals.json found at ${evalsPath}`);
  }
  const evalsFile: EvalsFile = JSON.parse(fs.readFileSync(evalsPath, 'utf-8'));
  const manager = new SnapshotManager(path.join(skillPath, 'evals'));
  const budget = new BudgetEngine(options.budget);
  const startTime = Date.now();

  if (manager.listSnapshotIds().length === 0) {
    throw new NoBaselineError(skillPath);
  }

  const scenarios: ScenarioResult[] = [];
  const tierBreakdown = { tier1_schema: 0, tier2_embedding: 0, tier3_llm_judge: 0 };

  for (const evalCase of evalsFile.evals) {
    const baseline = manager.loadSnapshot(evalCase.id);
    if (!baseline) continue;
    const newOutput = await skillAdapter.invoke(skillPath, evalCase.prompt, evalCase.files);
    const comparison = await comparePipeline(
      baseline.output.raw,
      newOutput.raw,
      inference,
      { threshold: options.threshold, skipEmbedding: options.skipEmbedding }
    );
    comparison.scenarioId = evalCase.id;
    if (comparison.tier === 1) tierBreakdown.tier1_schema++;
    else if (comparison.tier === 2) tierBreakdown.tier2_embedding++;
    else tierBreakdown.tier3_llm_judge++;
    budget.addCost(inference.estimateCost(newOutput.metadata.tokens));
    scenarios.push({
      scenarioId: evalCase.id,
      prompt: evalCase.prompt,
      comparison,
      timing: {
        total_tokens: newOutput.metadata.tokens,
        duration_ms: newOutput.metadata.durationMs,
      },
      newOutput,
    });
  }

  const passed = scenarios.filter((s) => s.comparison.verdict === 'pass').length;
  const regressed = scenarios.filter((s) => s.comparison.verdict === 'regressed').length;
  const summary: BenchmarkSummary = {
    total_scenarios: scenarios.length,
    passed,
    regressed,
    pass_rate: scenarios.length > 0 ? passed / scenarios.length : 1.0,
    total_tokens: scenarios.reduce((sum, s) => sum + s.timing.total_tokens, 0),
    total_cost_usd: budget.totalCost,
    total_duration_ms: Date.now() - startTime,
    tier_breakdown: tierBreakdown,
  };
  return {
    skillName: evalsFile.skill_name,
    scenarios,
    summary,
    timing: {
      total_tokens: summary.total_tokens,
      duration_ms: summary.total_duration_ms,
    },
  };
}
