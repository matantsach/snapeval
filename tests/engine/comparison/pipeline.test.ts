import { describe, it, expect, vi, beforeEach } from 'vitest';
import { comparePipeline } from '../../../src/engine/comparison/pipeline.js';
import type { InferenceAdapter, Message, ChatOptions } from '../../../src/types.js';

// Two texts that produce identical schema (same structure, different content)
const SAME_SCHEMA_A = '# Title\n\nSome content here\n\n- bullet one\n- bullet two';
const SAME_SCHEMA_B = '# Different Title\n\nOther content here\n\n- point A\n- point B';

// Two texts that have different schemas
const DIFF_SCHEMA_A = '# Heading\n\nContent paragraph here';
const DIFF_SCHEMA_B = 'Just a plain paragraph with no heading';

function makeMockAdapter(opts: {
  embedFn?: (text: string) => number[];
  chatResponses?: string[];
}): InferenceAdapter {
  let chatCallIndex = 0;
  return {
    name: 'mock',
    chat: vi.fn().mockImplementation((_messages: Message[], _options?: ChatOptions) => {
      const responses = opts.chatResponses ?? [];
      const resp = responses[chatCallIndex] ?? '{"verdict":"consistent"}';
      chatCallIndex++;
      return Promise.resolve(resp);
    }),
    embed: vi.fn().mockImplementation((text: string) => {
      if (opts.embedFn) return Promise.resolve(opts.embedFn(text));
      return Promise.resolve([1, 0]);
    }),
    estimateCost: vi.fn().mockReturnValue(0),
  };
}

describe('comparePipeline', () => {
  describe('Tier 1: schema gate', () => {
    it('returns tier=1 pass when schemas match and does NOT call embed', async () => {
      const adapter = makeMockAdapter({ embedFn: () => [1, 0] });
      const result = await comparePipeline(SAME_SCHEMA_A, SAME_SCHEMA_B, adapter, {
        threshold: 0.85,
      });

      expect(result.tier).toBe(1);
      expect(result.verdict).toBe('pass');
      expect(result.details).toBe('Schema match');
      expect(adapter.embed).not.toHaveBeenCalled();
      expect(adapter.chat).not.toHaveBeenCalled();
    });

    it('returns tier=1 pass for identical text', async () => {
      const adapter = makeMockAdapter({});
      const text = '# Hello\n\nWorld';
      const result = await comparePipeline(text, text, adapter, { threshold: 0.85 });

      expect(result.tier).toBe(1);
      expect(result.verdict).toBe('pass');
    });
  });

  describe('Tier 2: embedding gate', () => {
    it('returns tier=2 pass when schema differs but embedding similarity meets threshold', async () => {
      // Same vector for both → similarity = 1.0 → passes any threshold
      const adapter = makeMockAdapter({ embedFn: () => [1, 0] });
      const result = await comparePipeline(DIFF_SCHEMA_A, DIFF_SCHEMA_B, adapter, {
        threshold: 0.85,
      });

      expect(result.tier).toBe(2);
      expect(result.verdict).toBe('pass');
      expect(result.similarity).toBeCloseTo(1.0);
      expect(result.details).toContain('Embedding similarity');
      // LLM judge should NOT have been called
      expect(adapter.chat).not.toHaveBeenCalled();
    });

    it('includes similarity value formatted to 4 decimal places in details', async () => {
      const adapter = makeMockAdapter({ embedFn: () => [1, 0] });
      const result = await comparePipeline(DIFF_SCHEMA_A, DIFF_SCHEMA_B, adapter, {
        threshold: 0.85,
      });

      expect(result.details).toMatch(/Embedding similarity: \d+\.\d{4}/);
    });
  });

  describe('Tier 3: LLM judge fallback', () => {
    it('reaches Tier 3 when embedding similarity is below threshold', async () => {
      // cos([1,0],[0,1]) = 0.0 → below any threshold
      let callCount = 0;
      const adapter = makeMockAdapter({
        embedFn: () => (callCount++ === 0 ? [1, 0] : [0, 1]),
        chatResponses: [
          JSON.stringify({ verdict: 'consistent' }),
          JSON.stringify({ verdict: 'consistent' }),
        ],
      });

      const result = await comparePipeline(DIFF_SCHEMA_A, DIFF_SCHEMA_B, adapter, {
        threshold: 0.85,
      });

      expect(result.tier).toBe(3);
      expect(result.verdict).toBe('pass');
    });

    it('propagates regressed verdict from LLM judge', async () => {
      let callCount = 0;
      const adapter = makeMockAdapter({
        embedFn: () => (callCount++ === 0 ? [1, 0] : [0, 1]),
        chatResponses: [
          JSON.stringify({ verdict: 'different' }),
          JSON.stringify({ verdict: 'different' }),
        ],
      });

      const result = await comparePipeline(DIFF_SCHEMA_A, DIFF_SCHEMA_B, adapter, {
        threshold: 0.85,
      });

      expect(result.tier).toBe(3);
      expect(result.verdict).toBe('regressed');
    });

    it('propagates inconclusive verdict from LLM judge', async () => {
      let callCount = 0;
      const adapter = makeMockAdapter({
        embedFn: () => (callCount++ === 0 ? [1, 0] : [0, 1]),
        chatResponses: [
          JSON.stringify({ verdict: 'consistent' }),
          JSON.stringify({ verdict: 'different' }),
        ],
      });

      const result = await comparePipeline(DIFF_SCHEMA_A, DIFF_SCHEMA_B, adapter, {
        threshold: 0.85,
      });

      expect(result.tier).toBe(3);
      expect(result.verdict).toBe('inconclusive');
    });

    it('includes judgeReasoning in Tier 3 results', async () => {
      const consistent = JSON.stringify({ verdict: 'consistent' });
      let callCount = 0;
      const adapter = makeMockAdapter({
        embedFn: () => (callCount++ === 0 ? [1, 0] : [0, 1]),
        chatResponses: [consistent, consistent],
      });

      const result = await comparePipeline(DIFF_SCHEMA_A, DIFF_SCHEMA_B, adapter, {
        threshold: 0.85,
      });

      expect(result.tier).toBe(3);
      expect(result.judgeReasoning).toBeDefined();
      expect(result.judgeReasoning!.forward).toBe(consistent);
    });

    it('does not include judgeReasoning in Tier 1 results', async () => {
      const adapter = makeMockAdapter({});
      const result = await comparePipeline(SAME_SCHEMA_A, SAME_SCHEMA_B, adapter, {
        threshold: 0.85,
      });

      expect(result.tier).toBe(1);
      expect(result.judgeReasoning).toBeUndefined();
    });
  });

  describe('skipEmbedding option', () => {
    it('goes directly T1→T3 when skipEmbedding=true, skipping embed call', async () => {
      const adapter = makeMockAdapter({
        embedFn: () => [1, 0],
        chatResponses: [
          JSON.stringify({ verdict: 'consistent' }),
          JSON.stringify({ verdict: 'consistent' }),
        ],
      });

      const result = await comparePipeline(DIFF_SCHEMA_A, DIFF_SCHEMA_B, adapter, {
        threshold: 0.85,
        skipEmbedding: true,
      });

      expect(result.tier).toBe(3);
      // embed should never have been called
      expect(adapter.embed).not.toHaveBeenCalled();
      // chat should have been called (LLM judge)
      expect(adapter.chat).toHaveBeenCalled();
    });

    it('still resolves Tier 1 before reaching T3 when skipEmbedding=true', async () => {
      const adapter = makeMockAdapter({ skipEmbedding: true } as Parameters<typeof makeMockAdapter>[0]);
      const result = await comparePipeline(SAME_SCHEMA_A, SAME_SCHEMA_B, adapter, {
        threshold: 0.85,
        skipEmbedding: true,
      });

      expect(result.tier).toBe(1);
      expect(adapter.embed).not.toHaveBeenCalled();
      expect(adapter.chat).not.toHaveBeenCalled();
    });
  });

  describe('embedding error handling', () => {
    it('falls through to Tier 3 when embed throws', async () => {
      const adapter: InferenceAdapter = {
        name: 'mock',
        chat: vi.fn().mockResolvedValue(JSON.stringify({ verdict: 'consistent' })),
        embed: vi.fn().mockRejectedValue(new Error('embed service unavailable')),
        estimateCost: vi.fn().mockReturnValue(0),
      };

      const result = await comparePipeline(DIFF_SCHEMA_A, DIFF_SCHEMA_B, adapter, {
        threshold: 0.85,
      });

      expect(result.tier).toBe(3);
      // chat was called (LLM judge ran)
      expect(adapter.chat).toHaveBeenCalled();
    });
  });
});
