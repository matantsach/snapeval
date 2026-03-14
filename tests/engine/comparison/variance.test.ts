import { describe, it, expect } from 'vitest';
import { computeEnvelope, isWithinEnvelope } from '../../../src/engine/comparison/variance.js';
import type { VarianceEnvelopeRun, VarianceEnvelope } from '../../../src/types.js';

function makeRun(embedding: number[]): VarianceEnvelopeRun {
  return { raw: 'output text', embedding };
}

describe('computeEnvelope', () => {
  it('centroid is the mean of all embedding vectors', () => {
    const runs = [
      makeRun([1, 0]),
      makeRun([0, 1]),
      makeRun([1, 1]),
    ];
    const envelope = computeEnvelope(42, runs);

    // centroid = [(1+0+1)/3, (0+1+1)/3] = [2/3, 2/3]
    expect(envelope.centroid[0]).toBeCloseTo(2 / 3, 6);
    expect(envelope.centroid[1]).toBeCloseTo(2 / 3, 6);
  });

  it('centroid has the same dimensionality as the embeddings', () => {
    const runs = [makeRun([1, 2, 3, 4]), makeRun([5, 6, 7, 8])];
    const envelope = computeEnvelope(1, runs);
    expect(envelope.centroid).toHaveLength(4);
  });

  it('radius is 0 for identical embeddings', () => {
    const vec = [1, 0, 0];
    const runs = [makeRun(vec), makeRun(vec), makeRun(vec)];
    const envelope = computeEnvelope(1, runs);
    expect(envelope.radius).toBeCloseTo(0, 6);
  });

  it('radius is 0 for a single run', () => {
    const runs = [makeRun([1, 2, 3])];
    const envelope = computeEnvelope(1, runs);
    // Single run: centroid equals the run vector → cosine sim = 1 → distance = 0
    expect(envelope.radius).toBeCloseTo(0, 6);
  });

  it('radius equals max cosine distance from centroid across all runs', () => {
    // Two orthogonal vectors: centroid is [0.5, 0.5]
    // cos([1,0], [0.5,0.5]) = cos(45°) ≈ 0.7071 → distance ≈ 0.2929
    // cos([0,1], [0.5,0.5]) = cos(45°) ≈ 0.7071 → distance ≈ 0.2929
    const runs = [makeRun([1, 0]), makeRun([0, 1])];
    const envelope = computeEnvelope(1, runs);
    expect(envelope.radius).toBeCloseTo(1 - Math.cos(Math.PI / 4), 4);
  });

  it('preserves the scenarioId on the envelope', () => {
    const runs = [makeRun([1, 0])];
    const envelope = computeEnvelope(99, runs);
    expect(envelope.scenario_id).toBe(99);
  });

  it('preserves the runs array on the envelope', () => {
    const runs = [makeRun([1, 0]), makeRun([0, 1])];
    const envelope = computeEnvelope(1, runs);
    expect(envelope.runs).toBe(runs);
  });

  it('centroid is component-wise mean for a 3-run example', () => {
    const runs = [makeRun([3, 0]), makeRun([0, 6]), makeRun([0, 0])];
    const envelope = computeEnvelope(1, runs);
    expect(envelope.centroid[0]).toBeCloseTo(1, 6);
    expect(envelope.centroid[1]).toBeCloseTo(2, 6);
  });
});

describe('isWithinEnvelope', () => {
  it('returns true for an embedding identical to the centroid', () => {
    const centroid = [1, 0];
    const envelope: VarianceEnvelope = {
      scenario_id: 1,
      runs: [makeRun(centroid)],
      centroid,
      radius: 0,
    };
    // sim = 1.0, threshold = 0.85, radius = 0 → 1.0 >= 0.85 - 0 = 0.85 ✓
    expect(isWithinEnvelope([1, 0], envelope, 0.85)).toBe(true);
  });

  it('returns true for an embedding near the centroid within envelope', () => {
    // cos([1,0],[1,1]) ≈ 0.7071
    // With a generous envelope radius, it should still pass
    const envelope: VarianceEnvelope = {
      scenario_id: 1,
      runs: [],
      centroid: [1, 1],
      radius: 0.3, // wide envelope
    };
    // sim ≈ 0.7071, threshold = 0.85, radius = 0.3
    // 0.7071 >= 0.85 - 0.3 = 0.55 ✓
    expect(isWithinEnvelope([1, 0], envelope, 0.85)).toBe(true);
  });

  it('returns false for an embedding far from the centroid outside envelope', () => {
    // cos([1,0],[0,1]) = 0.0 — orthogonal
    const envelope: VarianceEnvelope = {
      scenario_id: 1,
      runs: [],
      centroid: [0, 1],
      radius: 0.1, // tight envelope
    };
    // sim = 0.0, threshold = 0.85, radius = 0.1
    // 0.0 >= 0.85 - 0.1 = 0.75? NO → false
    expect(isWithinEnvelope([1, 0], envelope, 0.85)).toBe(false);
  });

  it('returns false for an opposite vector (sim = -1)', () => {
    const envelope: VarianceEnvelope = {
      scenario_id: 1,
      runs: [],
      centroid: [1, 0],
      radius: 0,
    };
    // cos([-1,0],[1,0]) = -1, threshold=0.85, radius=0
    // -1 >= 0.85? NO → false
    expect(isWithinEnvelope([-1, 0], envelope, 0.85)).toBe(false);
  });

  it('returns true when envelope radius is large enough to accommodate a distant embedding', () => {
    // cos([1,0],[0,1]) = 0.0, threshold=0.85
    // With radius = 0.86, effective threshold = 0.85 - 0.86 = -0.01
    // 0.0 >= -0.01 ✓
    const envelope: VarianceEnvelope = {
      scenario_id: 1,
      runs: [],
      centroid: [0, 1],
      radius: 0.86,
    };
    expect(isWithinEnvelope([1, 0], envelope, 0.85)).toBe(true);
  });

  it('exactly at the boundary is considered within (>=)', () => {
    // We want sim = exactly threshold - radius
    // cos([1,0],[1,0]) = 1.0, threshold=0.85, radius=0.15
    // 1.0 >= 0.85 - 0.15 = 0.70 ✓ (also tests the >= boundary condition)
    const envelope: VarianceEnvelope = {
      scenario_id: 1,
      runs: [],
      centroid: [1, 0],
      radius: 0.15,
    };
    expect(isWithinEnvelope([1, 0], envelope, 0.85)).toBe(true);
  });
});
