import type { InferenceAdapter } from '../../types.js';

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

export async function embeddingCheck(
  baseline: string,
  current: string,
  inference: InferenceAdapter,
  threshold: number = 0.85
): Promise<{ similarity: number; pass: boolean }> {
  const [baselineEmb, currentEmb] = await Promise.all([
    inference.embed(baseline),
    inference.embed(current),
  ]);
  const similarity = cosineSimilarity(baselineEmb, currentEmb);
  return { similarity, pass: similarity >= threshold };
}
