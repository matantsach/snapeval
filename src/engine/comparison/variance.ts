import type { VarianceEnvelope, VarianceEnvelopeRun } from '../../types.js';
import { cosineSimilarity } from './embedding.js';

export function computeEnvelope(scenarioId: number, runs: VarianceEnvelopeRun[]): VarianceEnvelope {
  const dims = runs[0].embedding.length;
  const centroid = new Array(dims).fill(0);
  for (const run of runs) {
    for (let i = 0; i < dims; i++) {
      centroid[i] += run.embedding[i];
    }
  }
  for (let i = 0; i < dims; i++) {
    centroid[i] /= runs.length;
  }
  let maxDistance = 0;
  for (const run of runs) {
    const sim = cosineSimilarity(run.embedding, centroid);
    const distance = 1 - sim;
    if (distance > maxDistance) maxDistance = distance;
  }
  return { scenario_id: scenarioId, runs, centroid, radius: maxDistance };
}

export function isWithinEnvelope(
  embedding: number[],
  envelope: VarianceEnvelope,
  threshold: number
): boolean {
  const sim = cosineSimilarity(embedding, envelope.centroid);
  return sim >= threshold - envelope.radius;
}
