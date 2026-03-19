import { describe, it, expect, vi } from 'vitest';
import { buildGeneratorPrompt, generateEvals } from '../../src/engine/generator.js';
import type { InferenceAdapter } from '../../src/types.js';

// --- buildGeneratorPrompt ---

describe('buildGeneratorPrompt', () => {
  it('includes the skill content verbatim', () => {
    const skillContent = 'name: my-skill\ndescription: Does something useful';
    const prompt = buildGeneratorPrompt(skillContent);
    expect(prompt).toContain(skillContent);
  });

  it('asks for JSON output', () => {
    const prompt = buildGeneratorPrompt('some skill');
    expect(prompt).toContain('"skill_name"');
    expect(prompt).toContain('"evals"');
  });

  it('mentions happy path and edge cases', () => {
    const prompt = buildGeneratorPrompt('skill');
    expect(prompt.toLowerCase()).toContain('happy path');
    expect(prompt.toLowerCase()).toContain('edge case');
  });

  it('requests ONLY JSON with no markdown wrapping', () => {
    const prompt = buildGeneratorPrompt('skill');
    expect(prompt).toContain('Return ONLY the JSON');
  });

  it('does NOT ask for assertions', () => {
    const prompt = buildGeneratorPrompt('skill');
    expect(prompt).not.toContain('assertions');
  });

  it('asks for a slug field', () => {
    const prompt = buildGeneratorPrompt('skill');
    expect(prompt).toContain('"slug"');
  });
});

// --- generateEvals ---

function makeMockInference(responseText: string): InferenceAdapter {
  return {
    name: 'mock',
    chat: vi.fn().mockResolvedValue(responseText),
  };
}

const VALID_LLM_RESPONSE = JSON.stringify({
  skill_name: 'test-skill',
  evals: [
    {
      id: 1,
      slug: 'friendly-greeting',
      prompt: 'Hello, how are you?',
      expected_output: 'A friendly greeting response',
    },
    {
      id: 2,
      slug: 'simple-math',
      prompt: 'What is 2 + 2?',
      expected_output: 'Returns 4',
    },
  ],
});

describe('generateEvals', () => {
  it('parses a valid LLM response into EvalsFile', async () => {
    const inference = makeMockInference(VALID_LLM_RESPONSE);
    const result = await generateEvals('skill content', 'fallback-name', inference);

    expect(result.skill_name).toBe('test-skill');
    expect(result.evals).toHaveLength(2);
    expect(result.evals[0].id).toBe(1);
    expect(result.evals[0].prompt).toBe('Hello, how are you?');
    expect(result.evals[0].slug).toBe('friendly-greeting');
  });

  it('does not include generated_by in the result', async () => {
    const inference = makeMockInference(VALID_LLM_RESPONSE);
    const result = await generateEvals('skill content', 'fallback-name', inference);

    expect(result).not.toHaveProperty('generated_by');
  });

  it('generated evals have no assertions field', async () => {
    const inference = makeMockInference(VALID_LLM_RESPONSE);
    const result = await generateEvals('skill content', 'fallback-name', inference);

    for (const evalCase of result.evals) {
      expect(evalCase).not.toHaveProperty('assertions');
    }
  });

  it('generated evals can have slug field', async () => {
    const inference = makeMockInference(VALID_LLM_RESPONSE);
    const result = await generateEvals('skill content', 'fallback-name', inference);

    expect(result.evals[0].slug).toBe('friendly-greeting');
    expect(result.evals[1].slug).toBe('simple-math');
  });

  it('falls back to skillName when skill_name is missing from response', async () => {
    const response = JSON.stringify({
      evals: [{ id: 1, slug: 'test-case', prompt: 'test', expected_output: 'ok' }],
    });
    const inference = makeMockInference(response);
    const result = await generateEvals('skill', 'my-fallback-skill', inference);

    expect(result.skill_name).toBe('my-fallback-skill');
  });

  it('handles markdown-wrapped JSON (triple backtick)', async () => {
    const wrapped = '```json\n' + VALID_LLM_RESPONSE + '\n```';
    const inference = makeMockInference(wrapped);
    const result = await generateEvals('skill', 'fallback', inference);

    expect(result.evals).toHaveLength(2);
    expect(result.evals[0].prompt).toBe('Hello, how are you?');
  });

  it('handles markdown-wrapped JSON without language tag', async () => {
    const wrapped = '```\n' + VALID_LLM_RESPONSE + '\n```';
    const inference = makeMockInference(wrapped);
    const result = await generateEvals('skill', 'fallback', inference);

    expect(result.evals).toHaveLength(2);
  });

  it('fills in missing optional fields with defaults', async () => {
    const response = JSON.stringify({
      skill_name: 'skill',
      evals: [
        { prompt: 'a prompt' }, // missing id, slug, expected_output, files
      ],
    });
    const inference = makeMockInference(response);
    const result = await generateEvals('skill content', 'skill', inference);

    expect(result.evals[0].id).toBe(1); // auto-assigned index+1
    expect(result.evals[0].expected_output).toBe('');
    expect(result.evals[0].files).toEqual([]);
  });

  it('calls inference.chat with the generator prompt as user message', async () => {
    const inference = makeMockInference(VALID_LLM_RESPONSE);
    const skillContent = 'name: weather-skill\ndescription: Returns weather info';
    await generateEvals(skillContent, 'weather-skill', inference);

    expect(inference.chat).toHaveBeenCalledOnce();
    const [messages, options] = (inference.chat as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toContain(skillContent);
    expect(options?.responseFormat).toBe('json');
  });

  it('throws on malformed JSON from LLM', async () => {
    const inference = makeMockInference('this is not json at all');
    await expect(generateEvals('skill', 'fallback', inference)).rejects.toThrow();
  });

  it('preserves all evals from a large response', async () => {
    const evals = Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      slug: `case-${i + 1}`,
      prompt: `Prompt ${i + 1}`,
      expected_output: `Expected ${i + 1}`,
    }));
    const response = JSON.stringify({ skill_name: 'big-skill', evals });
    const inference = makeMockInference(response);
    const result = await generateEvals('skill', 'big-skill', inference);

    expect(result.evals).toHaveLength(8);
    expect(result.evals[7].id).toBe(8);
  });
});
