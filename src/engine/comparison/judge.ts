import type { InferenceAdapter, ComparisonVerdict } from '../../types.js';

export function buildJudgePrompt(outputA: string, outputB: string): string {
  return `You are an AI output comparison judge. Compare these two outputs and determine if they are semantically consistent (same meaning, same key information) or different (changed behavior, missing information, or contradictory content).

OUTPUT A:
---
${outputA}
---

OUTPUT B:
---
${outputB}
---

Respond with JSON only: {"verdict": "consistent"} or {"verdict": "different"}`;
}

interface JudgeResult {
  verdict: ComparisonVerdict;
  details: string;
  reasoning?: { forward: string; reverse: string };
}

function parseJudgeResponse(response: string): 'consistent' | 'different' | null {
  try {
    const parsed = JSON.parse(response);
    if (parsed.verdict === 'consistent' || parsed.verdict === 'different') return parsed.verdict;
    return null;
  } catch {
    return null;
  }
}

async function runJudgePair(
  baseline: string,
  current: string,
  inference: InferenceAdapter
): Promise<{ forward: string | null; reverse: string | null; rawForward: string; rawReverse: string }> {
  const [forwardResp, reverseResp] = await Promise.all([
    inference.chat([{ role: 'user', content: buildJudgePrompt(baseline, current) }], {
      temperature: 0,
      responseFormat: 'json',
    }),
    inference.chat([{ role: 'user', content: buildJudgePrompt(current, baseline) }], {
      temperature: 0,
      responseFormat: 'json',
    }),
  ]);
  return {
    forward: parseJudgeResponse(forwardResp),
    reverse: parseJudgeResponse(reverseResp),
    rawForward: forwardResp,
    rawReverse: reverseResp,
  };
}

export async function llmJudge(
  baseline: string,
  current: string,
  inference: InferenceAdapter
): Promise<JudgeResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { forward, reverse, rawForward, rawReverse } = await runJudgePair(baseline, current, inference);
    const reasoning = { forward: rawForward, reverse: rawReverse };
    if (forward === null || reverse === null) {
      if (attempt === 0) continue;
      return {
        verdict: 'inconclusive',
        details: 'LLM judge returned unparseable response after retry',
        reasoning,
      };
    }
    if (forward === reverse) {
      return {
        verdict: forward === 'consistent' ? 'pass' : 'regressed',
        details: `LLM Judge: both orderings agree — ${forward}`,
        reasoning,
      };
    }
    return {
      verdict: 'inconclusive',
      details: `LLM Judge: orderings disagree (forward=${forward}, reverse=${reverse})`,
      reasoning,
    };
  }
  return { verdict: 'inconclusive', details: 'LLM judge exhausted retries', reasoning: undefined };
}
