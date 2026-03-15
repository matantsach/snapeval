import { describe, it, expect, vi } from 'vitest';
import { comparePipeline } from '../../../src/engine/comparison/pipeline.js';
import type { InferenceAdapter, Message, ChatOptions } from '../../../src/types.js';

// Two texts that produce identical schema (same structure, different content)
const SAME_SCHEMA_A = '# Title\n\nSome content here\n\n- bullet one\n- bullet two';
const SAME_SCHEMA_B = '# Different Title\n\nOther content here\n\n- point A\n- point B';

// Two texts that have different schemas
const DIFF_SCHEMA_A = '# Heading\n\nContent paragraph here';
const DIFF_SCHEMA_B = 'Just a plain paragraph with no heading';

function makeMockAdapter(opts: {
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
    embed: vi.fn().mockResolvedValue([1, 0]),
    estimateCost: vi.fn().mockReturnValue(0),
  };
}

describe('comparePipeline', () => {
  describe('Tier 1: schema gate', () => {
    it('returns tier=1 pass when schemas match and does NOT call chat', async () => {
      const adapter = makeMockAdapter({});
      const result = await comparePipeline(SAME_SCHEMA_A, SAME_SCHEMA_B, adapter);

      expect(result.tier).toBe(1);
      expect(result.verdict).toBe('pass');
      expect(result.details).toBe('Schema match');
      expect(adapter.chat).not.toHaveBeenCalled();
    });

    it('returns tier=1 pass for identical text', async () => {
      const adapter = makeMockAdapter({});
      const text = '# Hello\n\nWorld';
      const result = await comparePipeline(text, text, adapter);

      expect(result.tier).toBe(1);
      expect(result.verdict).toBe('pass');
    });
  });

  describe('Tier 2: LLM judge', () => {
    it('reaches Tier 2 when schema differs and calls LLM judge', async () => {
      const adapter = makeMockAdapter({
        chatResponses: [
          JSON.stringify({ verdict: 'consistent' }),
          JSON.stringify({ verdict: 'consistent' }),
        ],
      });

      const result = await comparePipeline(DIFF_SCHEMA_A, DIFF_SCHEMA_B, adapter);

      expect(result.tier).toBe(2);
      expect(result.verdict).toBe('pass');
      expect(adapter.chat).toHaveBeenCalled();
    });

    it('propagates regressed verdict from LLM judge', async () => {
      const adapter = makeMockAdapter({
        chatResponses: [
          JSON.stringify({ verdict: 'different' }),
          JSON.stringify({ verdict: 'different' }),
        ],
      });

      const result = await comparePipeline(DIFF_SCHEMA_A, DIFF_SCHEMA_B, adapter);

      expect(result.tier).toBe(2);
      expect(result.verdict).toBe('regressed');
    });

    it('propagates inconclusive verdict from LLM judge', async () => {
      const adapter = makeMockAdapter({
        chatResponses: [
          JSON.stringify({ verdict: 'consistent' }),
          JSON.stringify({ verdict: 'different' }),
        ],
      });

      const result = await comparePipeline(DIFF_SCHEMA_A, DIFF_SCHEMA_B, adapter);

      expect(result.tier).toBe(2);
      expect(result.verdict).toBe('inconclusive');
    });

    it('includes judgeReasoning in Tier 2 results', async () => {
      const consistent = JSON.stringify({ verdict: 'consistent' });
      const adapter = makeMockAdapter({
        chatResponses: [consistent, consistent],
      });

      const result = await comparePipeline(DIFF_SCHEMA_A, DIFF_SCHEMA_B, adapter);

      expect(result.tier).toBe(2);
      expect(result.judgeReasoning).toBeDefined();
      expect(result.judgeReasoning!.forward).toBe(consistent);
    });

    it('does not include judgeReasoning in Tier 1 results', async () => {
      const adapter = makeMockAdapter({});
      const result = await comparePipeline(SAME_SCHEMA_A, SAME_SCHEMA_B, adapter);

      expect(result.tier).toBe(1);
      expect(result.judgeReasoning).toBeUndefined();
    });
  });
});
