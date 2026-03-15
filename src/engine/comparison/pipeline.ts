import type { InferenceAdapter, ComparisonResult } from '../../types.js';
import { schemaCheck } from './schema.js';
import { embeddingCheck } from './embedding.js';
import { llmJudge } from './judge.js';

export interface PipelineOptions {
  threshold: number;
  skipEmbedding?: boolean;
}

export async function comparePipeline(
  baseline: string,
  current: string,
  inference: InferenceAdapter,
  options: PipelineOptions
): Promise<ComparisonResult> {
  // Tier 1: Schema check (FREE)
  if (schemaCheck(baseline, current)) {
    return { scenarioId: 0, verdict: 'pass', tier: 1, details: 'Schema match' };
  }

  // Tier 2: Embedding similarity (CHEAP) — skip if unavailable
  if (!options.skipEmbedding) {
    try {
      const embResult = await embeddingCheck(baseline, current, inference, options.threshold);
      if (embResult.pass) {
        return {
          scenarioId: 0,
          verdict: 'pass',
          tier: 2,
          similarity: embResult.similarity,
          details: `Embedding similarity: ${embResult.similarity.toFixed(4)}`,
        };
      }
    } catch {
      // Embedding not available — fall through to Tier 3
    }
  }

  // Tier 3: LLM Judge (EXPENSIVE)
  const judgeResult = await llmJudge(baseline, current, inference);
  return {
    scenarioId: 0,
    verdict: judgeResult.verdict,
    tier: 3,
    details: judgeResult.details,
    judgeReasoning: judgeResult.reasoning,
  };
}
