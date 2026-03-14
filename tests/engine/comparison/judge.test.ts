import { describe, it, expect, vi } from 'vitest';
import { buildJudgePrompt, llmJudge } from '../../../src/engine/comparison/judge.js';
import type { InferenceAdapter, Message, ChatOptions } from '../../../src/types.js';

// Helper to build a mock InferenceAdapter whose chat() returns a fixed sequence of responses
function makeMockAdapter(responses: string[]): InferenceAdapter {
  let callIndex = 0;
  return {
    name: 'mock',
    chat: vi.fn().mockImplementation((_messages: Message[], _options?: ChatOptions) => {
      const resp = responses[callIndex];
      callIndex++;
      return Promise.resolve(resp);
    }),
    embed: vi.fn(),
    estimateCost: vi.fn().mockReturnValue(0),
  };
}

describe('buildJudgePrompt', () => {
  it('includes OUTPUT A in the prompt', () => {
    const prompt = buildJudgePrompt('alpha output', 'beta output');
    expect(prompt).toContain('alpha output');
  });

  it('includes OUTPUT B in the prompt', () => {
    const prompt = buildJudgePrompt('alpha output', 'beta output');
    expect(prompt).toContain('beta output');
  });

  it('contains both OUTPUT A and OUTPUT B section labels', () => {
    const prompt = buildJudgePrompt('A', 'B');
    expect(prompt).toContain('OUTPUT A');
    expect(prompt).toContain('OUTPUT B');
  });

  it('instructs JSON-only response', () => {
    const prompt = buildJudgePrompt('A', 'B');
    expect(prompt).toContain('JSON');
  });
});

describe('llmJudge', () => {
  it('returns pass when both orderings agree: consistent', async () => {
    const consistent = JSON.stringify({ verdict: 'consistent' });
    // forward + reverse both return consistent
    const adapter = makeMockAdapter([consistent, consistent]);
    const result = await llmJudge('baseline text', 'current text', adapter);
    expect(result.verdict).toBe('pass');
    expect(result.details).toContain('consistent');
  });

  it('returns regressed when both orderings agree: different', async () => {
    const different = JSON.stringify({ verdict: 'different' });
    const adapter = makeMockAdapter([different, different]);
    const result = await llmJudge('baseline text', 'current text', adapter);
    expect(result.verdict).toBe('regressed');
    expect(result.details).toContain('different');
  });

  it('returns inconclusive when orderings disagree', async () => {
    const consistent = JSON.stringify({ verdict: 'consistent' });
    const different = JSON.stringify({ verdict: 'different' });
    // forward = consistent, reverse = different
    const adapter = makeMockAdapter([consistent, different]);
    const result = await llmJudge('baseline text', 'current text', adapter);
    expect(result.verdict).toBe('inconclusive');
    expect(result.details).toContain('forward=consistent');
    expect(result.details).toContain('reverse=different');
  });

  it('retries once on unparseable response then marks inconclusive (4 total chat calls)', async () => {
    const garbage = 'not valid json at all';
    // All 4 responses are garbage: attempt 1 (forward + reverse) + attempt 2 (forward + reverse)
    const adapter = makeMockAdapter([garbage, garbage, garbage, garbage]);
    const result = await llmJudge('baseline text', 'current text', adapter);
    expect(result.verdict).toBe('inconclusive');
    expect(result.details).toContain('unparseable');
    // Confirm chat was called exactly 4 times
    expect((adapter.chat as ReturnType<typeof vi.fn>).mock.calls.length).toBe(4);
  });

  it('recovers on second attempt when first attempt returns unparseable', async () => {
    const garbage = 'not valid json';
    const consistent = JSON.stringify({ verdict: 'consistent' });
    // Attempt 1: both garbage (2 calls), Attempt 2: both consistent (2 calls)
    const adapter = makeMockAdapter([garbage, garbage, consistent, consistent]);
    const result = await llmJudge('baseline text', 'current text', adapter);
    expect(result.verdict).toBe('pass');
    expect((adapter.chat as ReturnType<typeof vi.fn>).mock.calls.length).toBe(4);
  });

  it('calls chat with temperature=0 and responseFormat=json', async () => {
    const consistent = JSON.stringify({ verdict: 'consistent' });
    const adapter = makeMockAdapter([consistent, consistent]);
    await llmJudge('a', 'b', adapter);
    const chatMock = adapter.chat as ReturnType<typeof vi.fn>;
    for (const call of chatMock.mock.calls) {
      const options: ChatOptions = call[1];
      expect(options?.temperature).toBe(0);
      expect(options?.responseFormat).toBe('json');
    }
  });

  it('forward prompt uses baseline as OUTPUT A and current as OUTPUT B', async () => {
    const consistent = JSON.stringify({ verdict: 'consistent' });
    const adapter = makeMockAdapter([consistent, consistent]);
    await llmJudge('BASELINE_CONTENT', 'CURRENT_CONTENT', adapter);
    const chatMock = adapter.chat as ReturnType<typeof vi.fn>;
    const forwardMessages: Message[] = chatMock.mock.calls[0][0];
    const forwardContent = forwardMessages[0].content;
    // In forward prompt, baseline appears before current
    expect(forwardContent.indexOf('BASELINE_CONTENT')).toBeLessThan(
      forwardContent.indexOf('CURRENT_CONTENT')
    );
  });

  it('reverse prompt swaps order: current as OUTPUT A and baseline as OUTPUT B', async () => {
    const consistent = JSON.stringify({ verdict: 'consistent' });
    const adapter = makeMockAdapter([consistent, consistent]);
    await llmJudge('BASELINE_CONTENT', 'CURRENT_CONTENT', adapter);
    const chatMock = adapter.chat as ReturnType<typeof vi.fn>;
    const reverseMessages: Message[] = chatMock.mock.calls[1][0];
    const reverseContent = reverseMessages[0].content;
    // In reverse prompt, current appears before baseline
    expect(reverseContent.indexOf('CURRENT_CONTENT')).toBeLessThan(
      reverseContent.indexOf('BASELINE_CONTENT')
    );
  });
});
