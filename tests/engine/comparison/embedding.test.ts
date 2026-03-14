import { describe, it, expect, vi } from 'vitest';
import { cosineSimilarity, embeddingCheck } from '../../../src/engine/comparison/embedding.js';
import type { InferenceAdapter } from '../../../src/types.js';

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it('returns 1.0 for identical non-unit vectors', () => {
    const a = [3, 4, 0];
    const b = [3, 4, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0);
  });

  it('returns 0.0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  it('returns 0.0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it('returns correct similarity for known vectors', () => {
    // [1,0] vs [1,1] — cos(45°) ≈ 0.707
    const a = [1, 0];
    const b = [1, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.7071, 3);
  });

  it('returns -1.0 for opposite vectors', () => {
    const a = [1, 0];
    const b = [-1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
  });
});

describe('embeddingCheck', () => {
  function makeMockAdapter(embedFn: (text: string) => number[]): InferenceAdapter {
    return {
      name: 'mock',
      chat: vi.fn(),
      embed: vi.fn().mockImplementation(embedFn),
      estimateCost: vi.fn().mockReturnValue(0),
    };
  }

  it('returns high similarity and pass=true for identical text (same embedding)', async () => {
    const vec = [1, 0, 0, 0];
    const adapter = makeMockAdapter(() => vec);
    const result = await embeddingCheck('hello', 'hello', adapter);
    expect(result.similarity).toBeCloseTo(1.0);
    expect(result.pass).toBe(true);
  });

  it('returns low similarity and pass=false for orthogonal embeddings', async () => {
    let call = 0;
    const adapter = makeMockAdapter(() => (call++ === 0 ? [1, 0] : [0, 1]));
    const result = await embeddingCheck('foo', 'bar', adapter);
    expect(result.similarity).toBeCloseTo(0.0);
    expect(result.pass).toBe(false);
  });

  it('respects custom threshold — passes when similarity meets threshold', async () => {
    // Both embeddings identical → similarity = 1.0, passes any threshold ≤ 1.0
    const vec = [1, 0];
    const adapter = makeMockAdapter(() => vec);
    const result = await embeddingCheck('a', 'b', adapter, 0.99);
    expect(result.pass).toBe(true);
  });

  it('respects custom threshold — fails when similarity is below threshold', async () => {
    // cos([1,0],[1,1]) ≈ 0.707
    let call = 0;
    const adapter = makeMockAdapter(() => (call++ === 0 ? [1, 0] : [1, 1]));
    const result = await embeddingCheck('a', 'b', adapter, 0.85);
    expect(result.similarity).toBeCloseTo(0.7071, 3);
    expect(result.pass).toBe(false);
  });

  it('uses default threshold of 0.85', async () => {
    // similarity = 0.707, should fail default threshold of 0.85
    let call = 0;
    const adapter = makeMockAdapter(() => (call++ === 0 ? [1, 0] : [1, 1]));
    const result = await embeddingCheck('a', 'b', adapter);
    expect(result.pass).toBe(false);
  });

  it('calls embed exactly twice (once per text)', async () => {
    const embedFn = vi.fn().mockReturnValue([1, 0]);
    const adapter: InferenceAdapter = {
      name: 'mock',
      chat: vi.fn(),
      embed: embedFn,
      estimateCost: vi.fn().mockReturnValue(0),
    };
    await embeddingCheck('hello', 'world', adapter);
    expect(embedFn).toHaveBeenCalledTimes(2);
    expect(embedFn).toHaveBeenCalledWith('hello');
    expect(embedFn).toHaveBeenCalledWith('world');
  });
});
