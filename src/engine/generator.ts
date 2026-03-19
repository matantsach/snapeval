import type { InferenceAdapter, EvalsFile } from '../types.js';

export function buildGeneratorPrompt(skillContent: string): string {
  return `You are a test case generator for AI skills. Read the following skill definition and generate 5-8 realistic test scenarios.

SKILL DEFINITION:
---
${skillContent}
---

Generate test scenarios as JSON with this exact format:
{
  "skill_name": "<name from skill>",
  "evals": [
    {
      "id": 1,
      "slug": "<2-4-word-kebab-case-label>",
      "prompt": "<realistic user prompt that would trigger this skill>",
      "expected_output": "<human-readable description of expected behavior>"
    }
  ]
}

Requirements:
- Include happy path scenarios (normal use cases)
- Include edge cases (empty input, malformed input, boundary conditions)
- Include at least one negative test (input the skill should handle gracefully)
- Prompts should be realistic — the way a real user would type them
- slug must be 2-4 words in kebab-case (e.g. "happy-path", "empty-input-edge-case")
- Return ONLY the JSON, no markdown wrapping`;
}

function extractJSON(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) return match[1].trim();
  return text.trim();
}

export async function generateEvals(
  skillContent: string,
  skillName: string,
  inference: InferenceAdapter
): Promise<EvalsFile> {
  const prompt = buildGeneratorPrompt(skillContent);
  const response = await inference.chat(
    [{ role: 'user', content: prompt }],
    { temperature: 0.7, responseFormat: 'json' }
  );
  const parsed = JSON.parse(extractJSON(response));
  return {
    skill_name: parsed.skill_name || skillName,
    evals: parsed.evals.map((e: any, i: number) => ({
      id: e.id || i + 1,
      slug: e.slug,
      prompt: e.prompt,
      expected_output: e.expected_output || '',
      files: e.files || [],
    })),
  };
}
