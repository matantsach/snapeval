import type { InferenceAdapter, ComparisonResult } from '../../types.js';
import { schemaCheck } from './schema.js';
import { llmJudge } from './judge.js';

export async function comparePipeline(
  baseline: string,
  current: string,
  inference: InferenceAdapter,
): Promise<ComparisonResult> {
  // Tier 1: Schema check (FREE)
  if (schemaCheck(baseline, current)) {
    return { scenarioId: 0, verdict: 'pass', tier: 1, details: 'Schema match' };
  }

  // Tier 2: LLM Judge
  const judgeResult = await llmJudge(baseline, current, inference);
  return {
    scenarioId: 0,
    verdict: judgeResult.verdict,
    tier: 2,
    details: judgeResult.details,
    judgeReasoning: judgeResult.reasoning,
  };
}
